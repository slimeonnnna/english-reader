/**
 * 英语点读软件主程序控制器 (Main Application Controller)
 * 整合离线词库、智能语音合成、生词本、词库管理与响应式交互
 */

const SAMPLE_ARTICLES = [
  {
    id: "jobs",
    title: "Steve Jobs - 斯坦福演讲 (Stay Hungry, Stay Foolish)",
    category: "励志经典",
    text: `Your time is limited, so don't waste it living someone else's life. 

Don't be trapped by dogma, which is living with the results of other people's thinking. Don't let the noise of others' opinions drown out your own inner voice. 

And most important, have the courage to follow your heart and intuition. They somehow already know what you truly want to become. Everything else is secondary.

Stay Hungry. Stay Foolish. I have always wished that for myself. And now, as you graduate to begin anew, I wish that for you.`
  },
  {
    id: "prince",
    title: "《小王子》经典片段 (The Fox and The Little Prince)",
    category: "文学名著",
    text: `"What does that mean -- 'tame'?" asked the little prince.

"It is an act too often neglected," said the fox. "It means to establish ties."

"To establish ties?"

"Just that," said the fox. "To me, you are still nothing more than a little boy who is just like a hundred thousand other little boys. And I have no need of you. And you, on your part, have no need of me. To you I am nothing more than a fox like a hundred thousand other foxes. But if you tame me, then we shall need each other. To me, you will be unique in all the world. To you, I shall be unique in all the world..."

"I am beginning to understand," said the little prince.`
  },
  {
    id: "tech_ai",
    title: "科技前沿：人工智能的未来 (The Future of AI)",
    category: "科技前沿",
    text: `Artificial intelligence is transforming every aspect of human life. From medical diagnosis to autonomous vehicles, intelligent algorithms help people solve complex problems faster than ever.

However, technology is only a tool created by human beings. The real challenge is to ensure that ethical principles, privacy, and compassion remain at the center of innovation. 

As we look toward tomorrow, continuous learning and critical thinking will be the most valuable skills for everyone.`
  },
  {
    id: "daily_life",
    title: "生活随笔：阅读的美好 (The Joy of Reading)",
    category: "生活散文",
    text: `Reading books gives us a quiet sanctuary in a busy world. When you open a good book, you can travel across time and space without leaving your favorite armchair.

Every new word you encounter is an invitation to explore deeper thoughts. With patience and practice, language becomes not a barrier, but a bridge connecting different cultures and wonderful stories.`
  }
];

class AppController {
  constructor() {
    this.reader = null;
    this.currentArticleText = "";
    this.currentTheme = "light";
    this.fontSize = 18;
    this.fontFamily = "serif";

    this.init();
  }

  init() {
    const container = document.getElementById("readerContent");
    const popover = document.getElementById("wordPopover");
    this.reader = new ArticleReader(container, popover);

    this.bindDOMEvents();
    this.initVoicePresetsUI();
    this.initThemeAndFont();
    this.renderVocabList();
    this.updateDictStats();

    // 默认加载第一篇示例文章
    this.loadSampleArticle("jobs");
  }

  bindDOMEvents() {
    // 1. 视图切换: 编辑与点读模式
    const btnSwitchRead = document.getElementById("btnSwitchRead");
    const btnSwitchEdit = document.getElementById("btnSwitchEdit");
    const articleInput = document.getElementById("articleInput");

    if (btnSwitchRead) {
      btnSwitchRead.addEventListener("click", () => {
        const text = articleInput.value.trim();
        if (!text) {
          alert("请输入或粘贴一些英文文本后再开始点读！");
          articleInput.focus();
          return;
        }
        this.currentArticleText = text;
        this.reader.loadArticle(text);
        this.switchMode("read");
      });
    }

    if (btnSwitchEdit) {
      btnSwitchEdit.addEventListener("click", () => {
        this.switchMode("edit");
      });
    }

    // 2. 示例文档选择
    const sampleSelect = document.getElementById("sampleSelect");
    if (sampleSelect) {
      sampleSelect.innerHTML = `<option value="" disabled selected>📖 示例文档快速体验...</option>` +
        SAMPLE_ARTICLES.map(a => `<option value="${a.id}">[${a.category}] ${a.title}</option>`).join("");

      sampleSelect.addEventListener("change", (e) => {
        const id = e.target.value;
        if (id) {
          this.loadSampleArticle(id);
          sampleSelect.value = "";
        }
      });
    }

    // 3. 导入本地 .txt 文件
    const fileInput = document.getElementById("fileInput");
    const btnImportFile = document.getElementById("btnImportFile");
    if (btnImportFile && fileInput) {
      btnImportFile.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target.result;
          articleInput.value = content;
          this.currentArticleText = content;
          this.reader.loadArticle(content);
          this.switchMode("read");
        };
        reader.readAsText(file);
      });
    }

    // 4. 清空输入
    const btnClearInput = document.getElementById("btnClearInput");
    if (btnClearInput) {
      btnClearInput.addEventListener("click", () => {
        if (confirm("确定要清空输入框内容吗？")) {
          articleInput.value = "";
          articleInput.focus();
        }
      });
    }

    // 5. 朗读控制条 (底部悬浮播放器)
    const btnPlayArticle = document.getElementById("btnPlayArticle");
    const btnPauseArticle = document.getElementById("btnPauseArticle");
    const btnStopArticle = document.getElementById("btnStopArticle");
    const btnPrevSentence = document.getElementById("btnPrevSentence");
    const btnNextSentence = document.getElementById("btnNextSentence");
    const rateSelect = document.getElementById("rateSelect");

    if (btnPlayArticle) {
      btnPlayArticle.addEventListener("click", () => {
        this.startOrResumePlayback();
      });
    }

    if (btnPauseArticle) {
      btnPauseArticle.addEventListener("click", () => {
        window.speechEngine.pause();
        this.updatePlayerControls(false, true);
      });
    }

    if (btnStopArticle) {
      btnStopArticle.addEventListener("click", () => {
        window.speechEngine.stop();
        this.reader.clearSentenceHighlight();
        this.updatePlayerControls(false, false);
      });
    }

    if (btnPrevSentence) {
      btnPrevSentence.addEventListener("click", () => {
        const cur = window.speechEngine.currentSentenceIdx;
        if (cur > 0) {
          window.speechEngine.jumpToSentence(cur - 1);
        }
      });
    }

    if (btnNextSentence) {
      btnNextSentence.addEventListener("click", () => {
        const cur = window.speechEngine.currentSentenceIdx;
        const total = this.reader.getSentenceList().length;
        if (cur < total - 1) {
          window.speechEngine.jumpToSentence(cur + 1);
        }
      });
    }

    if (rateSelect) {
      rateSelect.addEventListener("change", (e) => {
        const r = parseFloat(e.target.value);
        window.speechEngine.setRate(r);
      });
    }

    // 6. 音色快速切换与试听
    const voicePresetSelect = document.getElementById("voicePresetSelect");
    const btnPreviewVoice = document.getElementById("btnPreviewVoice");

    if (voicePresetSelect) {
      voicePresetSelect.addEventListener("change", (e) => {
        window.speechEngine.setPreset(e.target.value);
      });
    }

    if (btnPreviewVoice) {
      btnPreviewVoice.addEventListener("click", () => {
        window.speechEngine.previewCurrentVoice();
      });
    }

    // 7. 生词本侧边栏控制
    const btnOpenVocab = document.getElementById("btnOpenVocab");
    const btnCloseVocab = document.getElementById("btnCloseVocab");
    const vocabDrawer = document.getElementById("vocabDrawer");
    const btnExportCSV = document.getElementById("btnExportCSV");
    const btnExportTXT = document.getElementById("btnExportTXT");
    const btnClearVocab = document.getElementById("btnClearVocab");
    const vocabSearchInput = document.getElementById("vocabSearchInput");

    if (btnOpenVocab && vocabDrawer) {
      btnOpenVocab.addEventListener("click", () => {
        vocabDrawer.classList.add("open");
        this.renderVocabList();
      });
    }

    if (btnCloseVocab && vocabDrawer) {
      btnCloseVocab.addEventListener("click", () => {
        vocabDrawer.classList.remove("open");
      });
    }

    if (btnExportCSV) btnExportCSV.addEventListener("click", () => window.vocabManager.exportCSV());
    if (btnExportTXT) btnExportTXT.addEventListener("click", () => window.vocabManager.exportTXT());

    if (btnClearVocab) {
      btnClearVocab.addEventListener("click", () => {
        if (confirm("确定要清空生词本中的所有单词吗？此操作无法撤销。")) {
          window.vocabManager.clearAll();
        }
      });
    }

    if (vocabSearchInput) {
      vocabSearchInput.addEventListener("input", (e) => {
        this.renderVocabList(e.target.value.trim());
      });
    }

    window.addEventListener("vocabChanged", (e) => {
      this.updateVocabBadge(e.detail.count);
      this.renderVocabList();
    });

    // 8. 词典管理与批量导入弹窗 (Dict Manager)
    const btnOpenDictMgr = document.getElementById("btnOpenDictMgr");
    const dictModal = document.getElementById("dictModal");
    const btnCloseDictModal = document.getElementById("btnCloseDictModal");
    const btnDoImportDict = document.getElementById("btnDoImportDict");
    const dictImportText = document.getElementById("dictImportText");
    const dictFileInput = document.getElementById("dictFileInput");
    const btnUploadDictFile = document.getElementById("btnUploadDictFile");
    const btnExportDictJSON = document.getElementById("btnExportDictJSON");
    const btnExportDictCSV = document.getElementById("btnExportDictCSV");
    const btnClearCustomDict = document.getElementById("btnClearCustomDict");

    if (btnOpenDictMgr && dictModal) {
      btnOpenDictMgr.addEventListener("click", () => {
        this.updateDictStats();
        dictModal.classList.remove("hidden");
      });
    }

    if (btnCloseDictModal && dictModal) {
      btnCloseDictModal.addEventListener("click", () => {
        dictModal.classList.add("hidden");
      });
    }

    if (btnDoImportDict && dictImportText) {
      btnDoImportDict.addEventListener("click", () => {
        const text = dictImportText.value.trim();
        if (!text) {
          alert("请先输入或粘贴要导入的词库内容！");
          return;
        }
        const res = window.DictEngine.importDictionary(text);
        if (res.success) {
          alert(`🎉 成功导入 ${res.count} 个单词释义！`);
          dictImportText.value = "";
          this.updateDictStats();
        } else {
          alert(`导入失败: ${res.error}`);
        }
      });
    }

    if (btnUploadDictFile && dictFileInput) {
      btnUploadDictFile.addEventListener("click", () => dictFileInput.click());
      dictFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const res = window.DictEngine.importDictionary(event.target.result);
          if (res.success) {
            alert(`🎉 成功从文件导入 ${res.count} 个词条！`);
            this.updateDictStats();
          } else {
            alert(`导入文件失败: ${res.error}`);
          }
        };
        reader.readAsText(file);
      });
    }

    if (btnExportDictJSON) btnExportDictJSON.addEventListener("click", () => window.DictEngine.exportCustomJSON());
    if (btnExportDictCSV) btnExportDictCSV.addEventListener("click", () => window.DictEngine.exportCustomCSV());

    if (btnClearCustomDict) {
      btnClearCustomDict.addEventListener("click", () => {
        if (confirm("确定要清空所有自定义导入的词库数据吗？")) {
          window.DictEngine.clearCustomDict();
          this.updateDictStats();
          alert("已重置为系统默认内置词库！");
        }
      });
    }

    window.addEventListener("dictUpdated", () => this.updateDictStats());

    // 9. 设置弹窗
    const btnOpenSettings = document.getElementById("btnOpenSettings");
    const btnCloseSettings = document.getElementById("btnCloseSettings");
    const settingsModal = document.getElementById("settingsModal");
    const autoSpeakCheckbox = document.getElementById("autoSpeakCheckbox");
    const fontSizeSlider = document.getElementById("fontSizeSlider");
    const fontSizeValue = document.getElementById("fontSizeValue");

    if (btnOpenSettings && settingsModal) {
      btnOpenSettings.addEventListener("click", () => {
        settingsModal.classList.remove("hidden");
      });
    }

    if (btnCloseSettings && settingsModal) {
      btnCloseSettings.addEventListener("click", () => {
        settingsModal.classList.add("hidden");
      });
    }

    if (autoSpeakCheckbox) {
      const savedAuto = localStorage.getItem("english_reader_auto_speak");
      const isAuto = savedAuto === null ? true : savedAuto === "1";
      autoSpeakCheckbox.checked = isAuto;
      this.reader.setAutoSpeak(isAuto);

      autoSpeakCheckbox.addEventListener("change", (e) => {
        this.reader.setAutoSpeak(e.target.checked);
      });
    }

    if (fontSizeSlider) {
      fontSizeSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        this.setFontSize(val);
        if (fontSizeValue) fontSizeValue.textContent = `${val}px`;
      });
    }

    // 主题切换
    document.querySelectorAll(".theme-btn").forEach(btn => {
      btn.addEventListener("click", () => this.setTheme(btn.getAttribute("data-theme")));
    });

    // 字体切换
    document.querySelectorAll(".font-btn").forEach(btn => {
      btn.addEventListener("click", () => this.setFontFamily(btn.getAttribute("data-font")));
    });

    // 10. 编辑单个单词释义弹窗
    const editDefModal = document.getElementById("editDefModal");
    const btnSaveDef = document.getElementById("btnSaveDef");
    const btnCancelDef = document.getElementById("btnCancelDef");

    if (btnSaveDef) {
      btnSaveDef.addEventListener("click", () => {
        const word = document.getElementById("editDefWord").value.trim();
        const phonetic = document.getElementById("editDefPhonetic").value.trim();
        const def = document.getElementById("editDefTranslation").value.trim();
        if (!word || !def) {
          alert("单词与释义不能为空！");
          return;
        }
        window.DictEngine.addCustomWord(word, phonetic, def);
        editDefModal.classList.add("hidden");
        if (this.reader.currentActiveWordEl) {
          this.reader.handleWordClick(this.reader.currentActiveWordEl);
        }
      });
    }

    if (btnCancelDef) {
      btnCancelDef.addEventListener("click", () => editDefModal.classList.add("hidden"));
    }

    // 11. 快捷键
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        this.togglePlayback();
      } else if (e.code === "Escape") {
        this.reader.hidePopover();
        if (vocabDrawer) vocabDrawer.classList.remove("open");
        if (settingsModal) settingsModal.classList.add("hidden");
        if (dictModal) dictModal.classList.add("hidden");
        if (editDefModal) editDefModal.classList.add("hidden");
      }
    });
  }

  loadSampleArticle(id) {
    const article = SAMPLE_ARTICLES.find(a => a.id === id);
    if (!article) return;
    const articleInput = document.getElementById("articleInput");
    if (articleInput) articleInput.value = article.text;
    this.currentArticleText = article.text;
    this.reader.loadArticle(article.text);
    this.switchMode("read");
  }

  switchMode(mode) {
    const editView = document.getElementById("editView");
    const readView = document.getElementById("readView");
    const btnSwitchEdit = document.getElementById("btnSwitchEdit");
    const btnSwitchRead = document.getElementById("btnSwitchRead");
    const bottomPlayer = document.getElementById("bottomPlayer");

    if (mode === "read") {
      editView.style.display = "none";
      readView.style.display = "block";
      btnSwitchRead.classList.add("active");
      btnSwitchEdit.classList.remove("active");
      if (bottomPlayer) bottomPlayer.style.display = "flex";
    } else {
      editView.style.display = "block";
      readView.style.display = "none";
      btnSwitchEdit.classList.add("active");
      btnSwitchRead.classList.remove("active");
      if (bottomPlayer) bottomPlayer.style.display = "none";
      window.speechEngine.stop();
      this.reader.clearSentenceHighlight();
    }
  }

  initVoicePresetsUI() {
    const presetSelect = document.getElementById("voicePresetSelect");
    const settingsPresetSelect = document.getElementById("settingsVoicePresetSelect");

    const updatePresetSelections = () => {
      const cur = window.speechEngine.currentPresetKey;
      if (presetSelect) presetSelect.value = cur;
      if (settingsPresetSelect) settingsPresetSelect.value = cur;
    };

    window.addEventListener("voicesReady", updatePresetSelections);
    window.addEventListener("voicePresetChanged", updatePresetSelections);
    updatePresetSelections();
  }

  initThemeAndFont() {
    try {
      const savedTheme = localStorage.getItem("english_reader_theme") || "light";
      this.setTheme(savedTheme);
      const savedFontSize = localStorage.getItem("english_reader_font_size") || "18";
      this.setFontSize(parseInt(savedFontSize, 10));
      const savedFontFamily = localStorage.getItem("english_reader_font_family") || "serif";
      this.setFontFamily(savedFontFamily);
    } catch (e) {}

    this.updateVocabBadge(window.vocabManager.getCount());
  }

  setTheme(theme) {
    this.currentTheme = theme;
    document.body.className = `theme-${theme}`;
    try {
      localStorage.setItem("english_reader_theme", theme);
    } catch (e) {}

    document.querySelectorAll(".theme-btn").forEach(btn => {
      if (btn.getAttribute("data-theme") === theme) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  setFontSize(size) {
    this.fontSize = size;
    const readerContent = document.getElementById("readerContent");
    if (readerContent) {
      readerContent.style.fontSize = `${size}px`;
    }
    try {
      localStorage.setItem("english_reader_font_size", size);
    } catch (e) {}
  }

  setFontFamily(family) {
    this.fontFamily = family;
    const readerContent = document.getElementById("readerContent");
    if (readerContent) {
      if (family === "serif") {
        readerContent.style.fontFamily = `'Georgia', 'Cambria', 'Times New Roman', serif`;
      } else if (family === "sans") {
        readerContent.style.fontFamily = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
      } else {
        readerContent.style.fontFamily = `'Consolas', 'Courier New', monospace`;
      }
    }
    try {
      localStorage.setItem("english_reader_font_family", family);
    } catch (e) {}

    document.querySelectorAll(".font-btn").forEach(btn => {
      if (btn.getAttribute("data-font") === family) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  startOrResumePlayback() {
    if (window.speechEngine.isPaused) {
      window.speechEngine.resume();
      this.updatePlayerControls(true, false);
      return;
    }

    const sentences = this.reader.getSentenceList();
    if (!sentences || sentences.length === 0) {
      alert("当前没有可朗读的句子！");
      return;
    }

    let startIdx = 0;
    if (this.reader.currentActiveSentenceIdx >= 0) {
      startIdx = this.reader.currentActiveSentenceIdx;
    }

    this.updatePlayerControls(true, false);

    window.speechEngine.startArticlePlayback(sentences, startIdx, {
      onSentenceStart: (idx, text) => {
        this.reader.highlightSentence(idx);
        this.updateSentenceProgress(idx, sentences.length);
      },
      onSentenceEnd: () => {},
      onArticleEnd: () => {
        this.reader.clearSentenceHighlight();
        this.updatePlayerControls(false, false);
      }
    });
  }

  togglePlayback() {
    if (window.speechEngine.isPlayingArticle) {
      if (window.speechEngine.isPaused) {
        window.speechEngine.resume();
        this.updatePlayerControls(true, false);
      } else {
        window.speechEngine.pause();
        this.updatePlayerControls(false, true);
      }
    } else {
      this.startOrResumePlayback();
    }
  }

  updatePlayerControls(isPlaying, isPaused) {
    const btnPlay = document.getElementById("btnPlayArticle");
    const btnPause = document.getElementById("btnPauseArticle");
    const playerStatus = document.getElementById("playerStatus");

    if (btnPlay && btnPause) {
      if (isPlaying && !isPaused) {
        btnPlay.style.display = "none";
        btnPause.style.display = "inline-flex";
        if (playerStatus) playerStatus.textContent = "正在朗读中...";
      } else if (isPaused) {
        btnPlay.style.display = "inline-flex";
        btnPause.style.display = "none";
        if (playerStatus) playerStatus.textContent = "已暂停";
      } else {
        btnPlay.style.display = "inline-flex";
        btnPause.style.display = "none";
        if (playerStatus) playerStatus.textContent = "就绪";
      }
    }
  }

  updateSentenceProgress(currentIdx, totalCount) {
    const progressEl = document.getElementById("playerProgressText");
    const progressBar = document.getElementById("playerProgressBar");
    if (progressEl) {
      progressEl.textContent = `第 ${currentIdx + 1} / ${totalCount} 句`;
    }
    if (progressBar && totalCount > 0) {
      const pct = Math.round(((currentIdx + 1) / totalCount) * 100);
      progressBar.style.width = `${pct}%`;
    }
  }

  updateVocabBadge(count) {
    const badge = document.getElementById("vocabBadge");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "inline-block" : "none";
    }
  }

  updateDictStats() {
    const stats = window.DictEngine.getStats();
    const statsEl = document.getElementById("dictStatsSummary");
    if (statsEl) {
      statsEl.innerHTML = `内置词库: <strong>${stats.builtInCount}</strong> 词 ｜ 个人自定义词库: <strong>${stats.customCount}</strong> 词`;
    }
  }

  renderVocabList(searchQuery = "") {
    const container = document.getElementById("vocabListContainer");
    if (!container) return;

    let list = window.vocabManager.getAll();
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => 
        item.word.toLowerCase().includes(q) || 
        (item.translation && item.translation.includes(q))
      );
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-vocab-tip">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <p>${searchQuery ? "未找到匹配生词" : "生词本为空<br><small>阅读时点击单词，点击卡片中的⭐即可快速收藏</small>"}</p>
        </div>`;
      return;
    }

    let html = "";
    list.forEach(item => {
      html += `
        <div class="vocab-card" data-word="${item.word}">
          <div class="vocab-card-header">
            <span class="vocab-card-word">${item.word}</span>
            <span class="vocab-card-phonetic">${item.phonetic}</span>
            <button class="vocab-speak-btn" title="朗读美音" onclick="window.speechEngine.speakWordWithAccent('${item.word}', 'us')">
              🇺🇸
            </button>
            <button class="vocab-speak-btn" title="朗读英音" onclick="window.speechEngine.speakWordWithAccent('${item.word}', 'uk')">
              🇬🇧
            </button>
            <button class="vocab-del-btn" title="删除生词" onclick="window.vocabManager.removeWord('${item.word}')">
              ✕
            </button>
          </div>
          <div class="vocab-card-def">${item.translation}</div>
          ${item.sentence ? `<div class="vocab-card-sentence">“${this.reader.escapeHtml(item.sentence)}”</div>` : ""}
        </div>
      `;
    });

    container.innerHTML = html;
  }

  openEditDefModal(word, currentDef) {
    const modal = document.getElementById("editDefModal");
    const inputWord = document.getElementById("editDefWord");
    const inputPhonetic = document.getElementById("editDefPhonetic");
    const inputDef = document.getElementById("editDefTranslation");

    if (modal && inputWord && inputDef) {
      inputWord.value = word;
      inputPhonetic.value = `/${word.toLowerCase()}/`;
      inputDef.value = currentDef && !currentDef.includes("暂未收录") ? currentDef : "";
      modal.classList.remove("hidden");
      inputDef.focus();
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new AppController();
});
