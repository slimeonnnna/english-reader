/**
 * 本地语音合成朗读引擎 (Local Web Speech Synthesis Engine) V2.0
 * 100% 本地离线运行，无需任何 API 密钥与网络请求
 * 自动适配 iOS (Siri/Enhanced)、macOS、Windows (Natural)、Android (Google TTS)
 * 支持智能音色质量分级、男女声音色匹配、精确音色下拉选择、试听与防竞态逐句朗读
 */

class LocalSpeechEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.englishVoices = [];
    this.classifiedPresets = {
      us_female: null,
      us_male: null,
      uk_female: null,
      uk_male: null
    };
    this.currentPresetKey = "us_female"; // 默认美音女声
    this.selectedVoice = null;
    this.exactVoiceURI = null; // 用户手动指定的具体系统音色

    this.rate = 1.0;     // 语速: 0.5 ~ 2.0
    this.pitch = 1.0;    // 音调: 0.8 ~ 1.2
    this.volume = 1.0;   // 音量: 0 ~ 1.0

    // 整篇朗读控制状态与防竞态令牌
    this.isPlayingArticle = false;
    this.isPaused = false;
    this.sentenceList = [];
    this.currentSentenceIdx = -1;
    this.playbackToken = 0; // 防竞争序列号
    this.pauseTimer = null; // 句间停顿计时器

    this.onSentenceStartCallback = null;
    this.onSentenceEndCallback = null;
    this.onArticleEndCallback = null;
    this.onWordBoundaryCallback = null;

    this.init();
    this.initIOSAudioUnlock();
  }

  initIOSAudioUnlock() {
    const unlock = () => {
      if (this.synth) {
        try {
          const u = new SpeechSynthesisUtterance("");
          u.volume = 0;
          this.synth.speak(u);
        } catch (e) {}
      }
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
    document.addEventListener("touchstart", unlock, { once: true, passive: true });
    document.addEventListener("click", unlock, { once: true, passive: true });
  }

  init() {
    if (!this.synth) {
      console.warn("当前浏览器不支持 Web Speech API");
      return;
    }

    // 从 localStorage 读取用户偏好
    try {
      const savedRate = localStorage.getItem("english_reader_rate");
      if (savedRate) this.rate = parseFloat(savedRate);
      const savedPreset = localStorage.getItem("english_reader_voice_preset");
      if (savedPreset) this.currentPresetKey = savedPreset;
      const savedExactVoice = localStorage.getItem("english_reader_exact_voice");
      if (savedExactVoice) this.exactVoiceURI = savedExactVoice;
    } catch (e) {
      console.warn("读取朗读配置失败:", e);
    }

    this.loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  /**
   * 评估音色质量权重
   * Natural > Enhanced/Premium > Neural/Wavenet > Siri > 普通
   */
  getVoiceQualityScore(voice) {
    if (!voice) return 0;
    const name = (voice.name || "").toLowerCase();
    let score = 0;
    if (name.includes("natural") || name.includes("online (natural)")) score += 100;
    if (name.includes("premium") || name.includes("enhanced")) score += 80;
    if (name.includes("neural") || name.includes("wavenet")) score += 60;
    if (name.includes("siri")) score += 40;
    if (voice.localService === false) score += 10;
    return score;
  }

  loadVoices() {
    if (!this.synth) return;
    try {
      this.voices = this.synth.getVoices() || [];
    } catch (e) {
      this.voices = [];
    }

    // 过滤出英语语音 (包含美音、英音、澳音等系统自带声音)
    this.englishVoices = (this.voices || []).filter(v => {
      if (!v) return false;
      const lang = (v.lang || "").toLowerCase().replace("_", "-");
      const name = (v.name || "").toLowerCase();
      return lang.startsWith("en") || name.includes("english") || name.includes("siri") || name.includes("google");
    });

    // 智能分类美音与英音、男声与女声
    this.classifyVoices();

    // 恢复用户选定的声音
    this.applyCurrentSelection();

    // 触发全局声音列表就绪事件
    window.dispatchEvent(new CustomEvent("voicesReady", {
      detail: {
        voices: this.englishVoices,
        presets: this.classifiedPresets,
        currentPreset: this.currentPresetKey,
        selectedVoice: this.selectedVoice,
        exactVoiceURI: this.exactVoiceURI
      }
    }));
  }

  classifyVoices() {
    // 严格区分男声与女声，避免 "female" 误判为 "male"
    const isFemale = (name) => {
      const n = name.toLowerCase();
      return n.includes("female") || n.includes("zira") || n.includes("jenny") || 
             n.includes("samantha") || n.includes("karen") || n.includes("susan") || 
             n.includes("catherine") || n.includes("victoria") || n.includes("moira") ||
             n.includes("fiona") || n.includes("tessa") || n.includes("alice") ||
             n.includes("eva") || n.includes("stephanie");
    };

    const isMale = (name) => {
      const n = name.toLowerCase();
      if (isFemale(n)) return false; // 优先排查 female
      return n.includes("male") || n.includes("david") || n.includes("mark") || 
             n.includes("guy") || n.includes("daniel") || n.includes("george") || 
             n.includes("oliver") || n.includes("fred") || n.includes("alex") || 
             n.includes("tom") || n.includes("rishi") || n.includes("aaron");
    };

    const sortByQuality = (list) => {
      return [...list].sort((a, b) => this.getVoiceQualityScore(b) - this.getVoiceQualityScore(a));
    };

    // 1. 过滤美音与英音列表
    const usVoices = sortByQuality(this.englishVoices.filter(v => (v.lang || "").toLowerCase().includes("us")));
    const ukVoices = sortByQuality(this.englishVoices.filter(v => (v.lang || "").toLowerCase().includes("gb") || (v.lang || "").toLowerCase().includes("uk")));
    const allSorted = sortByQuality(this.englishVoices);

    // 2. 美音女声与男声匹配 (优先高质量)
    this.classifiedPresets.us_female = usVoices.find(v => isFemale(v.name)) || usVoices[0] || allSorted[0] || null;
    this.classifiedPresets.us_male = usVoices.find(v => isMale(v.name)) || usVoices.find(v => v !== this.classifiedPresets.us_female) || usVoices[0] || allSorted[0] || null;

    // 3. 英音女声与男声匹配
    this.classifiedPresets.uk_female = ukVoices.find(v => isFemale(v.name)) || ukVoices[0] || this.classifiedPresets.us_female;
    this.classifiedPresets.uk_male = ukVoices.find(v => isMale(v.name)) || ukVoices.find(v => v !== this.classifiedPresets.uk_female) || ukVoices[0] || this.classifiedPresets.us_male;
  }

  applyCurrentSelection() {
    // 优先使用用户手动指定的具体系统音色
    if (this.exactVoiceURI) {
      const found = this.englishVoices.find(v => (v.voiceURI || v.name) === this.exactVoiceURI);
      if (found) {
        this.selectedVoice = found;
        return;
      }
    }
    // 否则根据当前 4 个预设自动选择
    this.selectedVoice = this.classifiedPresets[this.currentPresetKey] || this.englishVoices[0] || null;
  }

  /**
   * 切换快捷预设 (us_female, us_male, uk_female, uk_male)
   */
  setPreset(presetKey) {
    if (this.classifiedPresets[presetKey]) {
      this.currentPresetKey = presetKey;
      this.exactVoiceURI = null; // 清除手动固定音色
      this.selectedVoice = this.classifiedPresets[presetKey];
      try {
        localStorage.setItem("english_reader_voice_preset", presetKey);
        localStorage.removeItem("english_reader_exact_voice");
      } catch (e) {}

      window.dispatchEvent(new CustomEvent("voicePresetChanged", {
        detail: {
          presetKey: this.currentPresetKey,
          voice: this.selectedVoice
        }
      }));
    }
  }

  /**
   * 手动选择具体设备音色
   */
  selectExactVoice(voiceURI) {
    const found = this.englishVoices.find(v => (v.voiceURI || v.name) === voiceURI);
    if (found) {
      this.exactVoiceURI = voiceURI;
      this.selectedVoice = found;
      try {
        localStorage.setItem("english_reader_exact_voice", voiceURI);
      } catch (e) {}

      window.dispatchEvent(new CustomEvent("voiceExactChanged", {
        detail: {
          voiceURI: this.exactVoiceURI,
          voice: this.selectedVoice
        }
      }));
    }
  }

  setRate(newRate) {
    this.rate = Math.max(0.5, Math.min(2.0, parseFloat(newRate) || 1.0));
    try {
      localStorage.setItem("english_reader_rate", this.rate);
    } catch (e) {}
  }

  getEffectivePitch(isMalePreset = null) {
    const isMale = isMalePreset !== null ? isMalePreset : this.currentPresetKey.endsWith("male");
    // 男声下沉音调至 0.78 营造沉稳低音；女声保持 1.06 清脆自然
    return isMale ? 0.78 : 1.06;
  }

  /**
   * 试听指定音色或当前音色
   */
  previewCurrentVoice(targetVoice = null) {
    const samplePhrases = {
      us_female: "Hello! This is American natural voice. Enjoy reading your favorite articles!",
      us_male: "Hello! This is American male voice. Stay hungry, stay foolish.",
      uk_female: "Good day! This is British female voice. Lovely day for reading.",
      uk_male: "Good day! This is British male voice. Practice makes perfect."
    };
    const text = samplePhrases[this.currentPresetKey] || "Hello, this is your English reading assistant!";
    this.speakWordWithSpecificVoice(text, targetVoice || this.selectedVoice);
  }

  /**
   * 使用指定 Voice 对象发音
   */
  speakWordWithSpecificVoice(text, voice) {
    if (!text || !this.synth) return;
    this.stopPlaybackInternal();

    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || "en-US";
    } else if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang || "en-US";
    } else {
      utterance.lang = "en-US";
    }

    utterance.rate = this.rate;
    utterance.pitch = this.getEffectivePitch();
    utterance.volume = this.volume;

    this.synth.speak(utterance);
  }

  /**
   * 按特定口音发音单词（美音或英音）
   */
  speakWordWithAccent(word, accent = "us") {
    if (!word || !this.synth) return;
    this.stopPlaybackInternal();

    const cleanWord = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    if (!cleanWord) return;

    const utterance = new SpeechSynthesisUtterance(cleanWord);
    let voice = null;
    const isMale = this.currentPresetKey.endsWith("male");

    if (accent === "uk") {
      voice = isMale ? (this.classifiedPresets.uk_male || this.classifiedPresets.uk_female) : (this.classifiedPresets.uk_female || this.classifiedPresets.uk_male);
      utterance.lang = "en-GB";
    } else {
      voice = isMale ? (this.classifiedPresets.us_male || this.classifiedPresets.us_female) : (this.classifiedPresets.us_female || this.classifiedPresets.us_male);
      utterance.lang = "en-US";
    }
    if (!voice) voice = this.selectedVoice;

    if (voice) {
      utterance.voice = voice;
    }

    utterance.rate = this.rate;
    utterance.pitch = this.getEffectivePitch(isMale);
    utterance.volume = this.volume;

    this.synth.speak(utterance);
  }

  /**
   * 朗读单词
   */
  speakWord(word, onEnd = null) {
    if (!word || !this.synth) return;
    this.stopPlaybackInternal();

    const cleanWord = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    if (!cleanWord) return;

    const utterance = new SpeechSynthesisUtterance(cleanWord);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang || (this.currentPresetKey.startsWith("uk") ? "en-GB" : "en-US");
    } else {
      utterance.lang = this.currentPresetKey.startsWith("uk") ? "en-GB" : "en-US";
    }

    utterance.rate = this.rate;
    utterance.pitch = this.getEffectivePitch();
    utterance.volume = this.volume;

    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };

    this.synth.speak(utterance);
  }

  /**
   * 朗读单句
   */
  speakSentence(sentenceText, onStart = null, onEnd = null) {
    if (!sentenceText || !this.synth) return;
    this.stopPlaybackInternal();

    const utterance = new SpeechSynthesisUtterance(sentenceText);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang || (this.currentPresetKey.startsWith("uk") ? "en-GB" : "en-US");
    } else {
      utterance.lang = this.currentPresetKey.startsWith("uk") ? "en-GB" : "en-US";
    }

    utterance.rate = this.rate;
    utterance.pitch = this.getEffectivePitch();
    utterance.volume = this.volume;

    utterance.onstart = () => { if (onStart) onStart(); };
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };

    this.synth.speak(utterance);
  }

  /**
   * 内部中断播放并使之前的回调令牌失效
   */
  stopPlaybackInternal() {
    this.playbackToken++;
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }
  }

  /**
   * 开始整篇逐句朗读
   */
  startArticlePlayback(sentenceList, startIndex = 0, callbacks = {}) {
    if (!sentenceList || sentenceList.length === 0) return;
    this.stop();

    this.sentenceList = sentenceList;
    this.currentSentenceIdx = Math.max(0, Math.min(startIndex, sentenceList.length - 1));
    this.isPlayingArticle = true;
    this.isPaused = false;

    this.onSentenceStartCallback = callbacks.onSentenceStart || null;
    this.onSentenceEndCallback = callbacks.onSentenceEnd || null;
    this.onArticleEndCallback = callbacks.onArticleEnd || null;

    this._playNextSentence();
  }

  _playNextSentence() {
    if (!this.isPlayingArticle || this.currentSentenceIdx >= this.sentenceList.length) {
      this.isPlayingArticle = false;
      this.isPaused = false;
      if (this.onArticleEndCallback) this.onArticleEndCallback();
      return;
    }

    const currentToken = ++this.playbackToken;
    const text = this.sentenceList[this.currentSentenceIdx];
    const utterance = new SpeechSynthesisUtterance(text);

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang || (this.currentPresetKey.startsWith("uk") ? "en-GB" : "en-US");
    } else {
      utterance.lang = this.currentPresetKey.startsWith("uk") ? "en-GB" : "en-US";
    }

    utterance.rate = this.rate;
    utterance.pitch = this.getEffectivePitch();
    utterance.volume = this.volume;

    utterance.onstart = () => {
      if (currentToken !== this.playbackToken) return;
      if (this.onSentenceStartCallback) {
        this.onSentenceStartCallback(this.currentSentenceIdx, text);
      }
    };

    utterance.onend = () => {
      if (currentToken !== this.playbackToken) return;
      if (this.onSentenceEndCallback) {
        this.onSentenceEndCallback(this.currentSentenceIdx);
      }
      if (this.isPlayingArticle) {
        this.currentSentenceIdx++;
        // 句间优化自然停顿 (200ms)
        this.pauseTimer = setTimeout(() => {
          if (currentToken === this.playbackToken && this.isPlayingArticle) {
            this._playNextSentence();
          }
        }, 200);
      }
    };

    utterance.onerror = (e) => {
      if (currentToken !== this.playbackToken) return;
      if (e.error === "canceled" || e.error === "interrupted") {
        return; // 被手动取消，不触发跳句
      }
      console.warn("朗读句子异常:", e);
      if (this.isPlayingArticle) {
        this.currentSentenceIdx++;
        this._playNextSentence();
      }
    };

    this.synth.speak(utterance);
  }

  pause() {
    if (this.synth && this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
      this.isPaused = true;
    }
  }

  resume() {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
      this.isPaused = false;
    }
  }

  stop() {
    this.isPlayingArticle = false;
    this.isPaused = false;
    this.stopPlaybackInternal();
  }

  jumpToSentence(index) {
    if (index >= 0 && index < this.sentenceList.length) {
      this.stopPlaybackInternal();
      this.currentSentenceIdx = index;
      if (this.isPlayingArticle) {
        this._playNextSentence();
      }
    }
  }
}

window.speechEngine = new LocalSpeechEngine();
