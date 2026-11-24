/**
 * 本地语音合成朗读引擎 (Local Web Speech Synthesis Engine)
 * 100% 本地离线运行，无需任何 API 密钥与网络请求
 * 支持单词朗读、单句朗读、整篇连续跟读、语速调节、发音人切换
 */

class LocalSpeechEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.englishVoices = [];
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
  }

  init() {
    if (!this.synth) {
      console.warn("当前浏览器不支持 Web Speech API");
      return;
    }

    // 加载本地语音库
    this.loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }

    // 从 localStorage 读取用户偏好
    try {
      const savedRate = localStorage.getItem("english_reader_rate");
      if (savedRate) this.rate = parseFloat(savedRate);
      const savedVoiceURI = localStorage.getItem("english_reader_voice_uri");
      this.savedVoiceURI = savedVoiceURI;
    } catch (e) {
      console.warn("读取朗读配置失败:", e);
    }
  }

  loadVoices() {
    this.voices = this.synth.getVoices();
    // 过滤出英语语音 (包含美音、英音、澳音等系统自带声音)
    this.englishVoices = this.voices.filter(v => 
      v.lang.toLowerCase().startsWith("en") || 
      v.name.toLowerCase().includes("english")
    );

    // 默认选择美式英语或系统默认英文声音
    if (this.englishVoices.length > 0) {
      if (this.savedVoiceURI) {
        this.selectedVoice = this.englishVoices.find(v => v.voiceURI === this.savedVoiceURI) || this.englishVoices[0];
      } else {
        // 优先匹配标准美式 (en-US) 或英式 (en-GB)
        this.selectedVoice = this.englishVoices.find(v => v.lang === "en-US") ||
                             this.englishVoices.find(v => v.lang === "en-GB") ||
                             this.englishVoices[0];
      }
    }

    // 触发全局声音列表就绪事件
    window.dispatchEvent(new CustomEvent("voicesReady", { detail: { voices: this.englishVoices, selected: this.selectedVoice } }));
  }

  setVoice(voiceURI) {
    const v = this.englishVoices.find(item => item.voiceURI === voiceURI);
    if (v) {
      this.selectedVoice = v;
      try {
        localStorage.setItem("english_reader_voice_uri", voiceURI);
      } catch (e) {}
    }
  }

  setRate(newRate) {
    this.rate = Math.max(0.5, Math.min(2.0, parseFloat(newRate) || 1.0));
    try {
      localStorage.setItem("english_reader_rate", this.rate);
    } catch (e) {}
  }

  /**
   * 朗读单个单词
   * @param {string} word - 要朗读的单词
   * @param {function} onEnd - 朗读结束回调
   */
  speakWord(word, onEnd = null) {
    if (!word || !this.synth) return;
    
    // 如果正在整篇朗读，不强制打断整个流程，或者打断单次
    this.synth.cancel();

    const cleanWord = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanWord);
    utterance.lang = this.selectedVoice ? this.selectedVoice.lang : "en-US";
    if (this.selectedVoice) utterance.voice = this.selectedVoice;
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      console.warn("单词朗读出错:", e);
      if (onEnd) onEnd();
    };

    this.synth.speak(utterance);
  }

  /**
   * 朗读单句
   * @param {string} sentenceText - 句子文本
   * @param {function} onEnd - 结束回调
   */
  speakSentence(sentenceText, onStart = null, onEnd = null) {
    if (!sentenceText || !this.synth) return;
    this.stop();

    const utterance = new SpeechSynthesisUtterance(sentenceText);
    utterance.lang = this.selectedVoice ? this.selectedVoice.lang : "en-US";
    if (this.selectedVoice) utterance.voice = this.selectedVoice;
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      console.warn("单句朗读出错:", e);
      if (onEnd) onEnd();
    };

    this.synth.speak(utterance);
  }

  /**
   * 开始整篇逐句朗读
   * @param {Array<string>} sentenceList - 句子文本列表
   * @param {number} startIndex - 从第几句开始
   * @param {object} callbacks - 回调集合
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
    this.onWordBoundaryCallback = callbacks.onWordBoundary || null;

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
    utterance.lang = this.selectedVoice ? this.selectedVoice.lang : "en-US";
    if (this.selectedVoice) utterance.voice = this.selectedVoice;
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    utterance.onstart = () => {
      if (this.onSentenceStartCallback) {
        this.onSentenceStartCallback(this.currentSentenceIdx, text);
      }
    };

    utterance.onboundary = (event) => {
      if (event.name === "word" && this.onWordBoundaryCallback) {
        this.onWordBoundaryCallback(this.currentSentenceIdx, event.charIndex, event.charLength);
      }
    };

    utterance.onend = () => {
      if (this.onSentenceEndCallback) {
        this.onSentenceEndCallback(this.currentSentenceIdx);
      }
      if (this.isPlayingArticle) {
        this.currentSentenceIdx++;
        // 句间轻微停顿 (180ms)，更符合真人朗读节奏
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

// 实例化并暴露全局对象
window.speechEngine = new LocalSpeechEngine();
