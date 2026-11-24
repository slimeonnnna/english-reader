/**
 * 本地语音合成朗读引擎 (Local Web Speech Synthesis Engine)
 * 100% 本地离线运行，无需任何 API 密钥与网络请求
 * 自动适配 Windows、macOS、iOS (Siri) 与 Android (Google TTS)
 * 支持 🇺🇸美音 / 🇬🇧英音 / 男声 / 女声 智能分类、一键试听与逐句朗读
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

    this.rate = 1.0;     // 语速: 0.5 ~ 2.0
    this.pitch = 1.0;    // 音调: 0.8 ~ 1.2
    this.volume = 1.0;   // 音量: 0 ~ 1.0

    // 整篇朗读控制状态
    this.isPlayingArticle = false;
    this.isPaused = false;
    this.sentenceList = [];
    this.currentSentenceIdx = -1;

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
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        this.synth.speak(u);
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

    this.loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }

    // 从 localStorage 读取用户偏好
    try {
      const savedRate = localStorage.getItem("english_reader_rate");
      if (savedRate) this.rate = parseFloat(savedRate);
      const savedPreset = localStorage.getItem("english_reader_voice_preset");
      if (savedPreset) this.currentPresetKey = savedPreset;
    } catch (e) {
      console.warn("读取朗读配置失败:", e);
    }
  }

  loadVoices() {
    this.voices = this.synth.getVoices();
    // 过滤出英语语音 (包含美音、英音、澳音等系统自带声音)
    this.englishVoices = this.voices.filter(v => {
      const lang = (v.lang || "").toLowerCase().replace("_", "-");
      const name = (v.name || "").toLowerCase();
      return lang.startsWith("en") || name.includes("english") || name.includes("siri");
    });

    // 智能分类美音与英音、男声与女声
    this.classifyVoices();

    // 根据当前预设选取声音
    this.applyCurrentPreset();

    // 触发全局声音列表就绪事件
    window.dispatchEvent(new CustomEvent("voicesReady", {
      detail: {
        voices: this.englishVoices,
        presets: this.classifiedPresets,
        currentPreset: this.currentPresetKey,
        selectedVoice: this.selectedVoice
      }
    }));
  }

  classifyVoices() {
    const isMale = (name) => {
      const n = name.toLowerCase();
      return n.includes("david") || n.includes("mark") || n.includes("guy") || 
             n.includes("daniel") || n.includes("george") || n.includes("oliver") || 
             n.includes("male") || n.includes("fred");
    };

    const isFemale = (name) => {
      const n = name.toLowerCase();
      return n.includes("zira") || n.includes("jenny") || n.includes("samantha") || 
             n.includes("karen") || n.includes("female") || n.includes("susan") || 
             n.includes("catherine") || n.includes("victoria") || n.includes("moira");
    };

    // 1. 过滤美音与英音列表
    const usVoices = this.englishVoices.filter(v => (v.lang || "").toLowerCase().includes("us"));
    const ukVoices = this.englishVoices.filter(v => (v.lang || "").toLowerCase().includes("gb") || (v.lang || "").toLowerCase().includes("uk"));

    // 2. 美音女声与男声匹配
    this.classifiedPresets.us_female = usVoices.find(v => isFemale(v.name)) || usVoices[0] || this.englishVoices[0];
    this.classifiedPresets.us_male = usVoices.find(v => isMale(v.name)) || usVoices.find(v => v !== this.classifiedPresets.us_female) || usVoices[0] || this.englishVoices[0];

    // 3. 英音女声与男声匹配
    this.classifiedPresets.uk_female = ukVoices.find(v => isFemale(v.name)) || ukVoices[0] || this.classifiedPresets.us_female;
    this.classifiedPresets.uk_male = ukVoices.find(v => isMale(v.name)) || ukVoices.find(v => v !== this.classifiedPresets.uk_female) || ukVoices[0] || this.classifiedPresets.us_male;
  }

  applyCurrentPreset() {
    this.selectedVoice = this.classifiedPresets[this.currentPresetKey] || this.englishVoices[0] || null;
  }

  setPreset(presetKey) {
    if (this.classifiedPresets[presetKey]) {
      this.currentPresetKey = presetKey;
      this.selectedVoice = this.classifiedPresets[presetKey];
      try {
        localStorage.setItem("english_reader_voice_preset", presetKey);
      } catch (e) {}

      window.dispatchEvent(new CustomEvent("voicePresetChanged", {
        detail: {
          presetKey: this.currentPresetKey,
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

  /**
   * 试听当前选择的音色
   */
  previewCurrentVoice() {
    const samplePhrases = {
      us_female: "Hello! This is American female voice. Enjoy reading!",
      us_male: "Hello! This is American male voice. Stay hungry, stay foolish.",
      uk_female: "Good day! This is British female voice. Lovely day for reading.",
      uk_male: "Good day! This is British male voice. Practice makes perfect."
    };
    const text = samplePhrases[this.currentPresetKey] || "Hello, this is your English reading assistant!";
    this.speakWord(text);
  }

  /**
   * 按特定口音发音单词（美音或英音）
   * @param {string} word - 单词
   * @param {string} accent - "us" 或 "uk"
   */
  speakWordWithAccent(word, accent = "us") {
    if (!word || !this.synth) return;
    this.synth.cancel();

    const cleanWord = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanWord);
    
    let voice = null;
    if (accent === "uk") {
      voice = this.classifiedPresets.uk_female || this.classifiedPresets.uk_male;
    } else {
      voice = this.classifiedPresets.us_female || this.classifiedPresets.us_male;
    }
    if (!voice) voice = this.selectedVoice;

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = accent === "uk" ? "en-GB" : "en-US";
    }

    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    this.synth.speak(utterance);
  }

  /**
   * 朗读单词
   */
  speakWord(word, onEnd = null) {
    if (!word || !this.synth) return;
    this.synth.cancel();

    const cleanWord = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanWord);
    
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang;
    } else {
      utterance.lang = "en-US";
    }

    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
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
    this.stop();

    const utterance = new SpeechSynthesisUtterance(sentenceText);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang;
    } else {
      utterance.lang = "en-US";
    }

    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    utterance.onstart = () => { if (onStart) onStart(); };
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };

    this.synth.speak(utterance);
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

    const text = this.sentenceList[this.currentSentenceIdx];
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang;
    } else {
      utterance.lang = "en-US";
    }

    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    utterance.onstart = () => {
      if (this.onSentenceStartCallback) {
        this.onSentenceStartCallback(this.currentSentenceIdx, text);
      }
    };

    utterance.onend = () => {
      if (this.onSentenceEndCallback) {
        this.onSentenceEndCallback(this.currentSentenceIdx);
      }
      if (this.isPlayingArticle) {
        this.currentSentenceIdx++;
        // 句间轻微停顿 (180ms)
        setTimeout(() => {
          if (this.isPlayingArticle) {
            this._playNextSentence();
          }
        }, 180);
      }
    };

    utterance.onerror = (e) => {
      console.warn("朗读句子错误:", e);
      if (this.isPlayingArticle) {
        this.currentSentenceIdx++;
        this._playNextSentence();
      }
    };

    this.synth.speak(utterance);
  }

  pause() {
    if (this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
      this.isPaused = true;
    }
  }

  resume() {
    if (this.synth.paused) {
      this.synth.resume();
      this.isPaused = false;
    }
  }

  stop() {
    this.isPlayingArticle = false;
    this.isPaused = false;
    if (this.synth) {
      this.synth.cancel();
    }
  }

  jumpToSentence(index) {
    if (index >= 0 && index < this.sentenceList.length) {
      this.currentSentenceIdx = index;
      if (this.isPlayingArticle) {
        this.synth.cancel();
        this._playNextSentence();
      }
    }
  }
}

window.speechEngine = new LocalSpeechEngine();
