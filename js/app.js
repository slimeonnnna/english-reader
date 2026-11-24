/**
 * 英语点读软件主程序控制器 (Main Application Controller) V2.0
 * 整合离线词库、智能语音合成、生词本、文章历史管理、SM-2 记忆复习与数据备份
 */

const SAMPLE_ARTICLES = [
  {
    id: "learning",
    title: "The Art of Language Learning",
    category: "学习心得",
    text: "Learning a new language opens up fresh perspectives on the world. Consistent daily practice, even for just fifteen minutes, helps build strong reading habits and improves vocabulary retention over time.\n\nEvery unfamiliar word is a valuable learning opportunity. By exploring context sentences and reviewing regularly, language learners can achieve fluency with confidence."
  },
  {
    id: "nature",
    title: "Wonders of the Natural World",
    category: "自然科学",
    text: "Forests and oceans sustain delicate ecosystems across our planet. From ancient trees that provide clean air to marine organisms that regulate the climate, nature provides essential resources for all living beings.\n\nProtecting these natural habitats ensures a healthier environment and a sustainable future for generations to come."
  },
  {
    id: "technology",
    title: "How Technology Shapes Modern Life",
    category: "数字科技",
    text: "Modern innovations have made information accessible at our fingertips. With digital tools, people can communicate instantly across great distances and collaborate on global challenges.\n\nUsing technology mindfully allows us to stay curious, productive, and connected in a rapidly changing world."
  }
];

class AppController {
  constructor() {
    this.reader = null;
    this.currentArticleId = null;
    this.currentArticleTitle = "";
    this.currentArticleText = "";
    this.currentTheme = "light";
    this.fontSize = 18;
    this.fontFamily = "serif";

    // SM-2 复习状态
    this.dueCards = [];
    this.currentReviewIdx = 0;

    this.init();
  }

  async init() {
    const container = document.getElementById("readerContent");
    const popover = document.getElementById("wordPopover");
    this.reader = new ArticleReader(container, popover);

    this.bindDOMEvents();
    this.initVoicePresetsUI();
    this.initThemeAndFont();
    this.renderVocabList();
    this.updateDictStats();

    // 尝试恢复上一次阅读的文章与进度
    await this.restoreLastReadingSession();
  }

  async restoreLastReadingSession() {
    try {
      if (window.localDB) {
        const lastArtId = await window.localDB.getSetting("last_reading_article_id");
        if (lastArtId) {
          const article = await window.localDB.getArticle(lastArtId);
          if (article && article.content) {
            this.loadArticleData(article);
            return;
          }
        }
      }
    } catch (e) {
      console.warn("恢复上次阅读会话失败:", e);
    }

    // 默认加载第一篇示例文章
    this.loadSampleArticle("jobs");
  }

  bindDOMEvents() {
    // 1. 视图切换
    const btnSwitchRead = document.getElementById("btnSwitchRead");
    const btnSwitchEdit = document.getElementById("btnSwitchEdit");
    const articleInput = document.getElementById("articleInput");
    const articleTitleInput = document.getElementById("articleTitleInput");

    if (btnSwitchRead) {
      btnSwitchRead.addEventListener("click", () => {
        const text = articleInput.value.trim();
        if (!text) {
          alert("请输入或粘贴一些英文文本后再开始点读！");
          articleInput.focus();
          return;
        }
        let title = articleTitleInput.value.trim();
        if (!title) {
          // 默认提取第一句或前 30 个字符作为标题
          title = text.split("\n")[0].slice(0, 32).trim() || "我的阅读文章";
          articleTitleInput.value = title;
        }
        this.currentArticleTitle = title;
        this.currentArticleText = text;
        this.reader.loadArticle(text);
        this.switchMode("read");
        this.autoSaveCurrentArticle();
      });
    }

    if (btnSwitchEdit) {
      btnSwitchEdit.addEventListener("click", () => {
        this.switchMode("edit");
      });
    }

    // 2. 保存文章按钮
    const btnSaveCurrentArticle = document.getElementById("btnSaveCurrentArticle");
    if (btnSaveCurrentArticle) {
      btnSaveCurrentArticle.addEventListener("click", async () => {
        const text = articleInput.value.trim();
        if (!text) {
          alert("文本为空，无法保存！");
          return;
        }
        let title = articleTitleInput.value.trim() || text.split("\n")[0].slice(0, 32).trim();
        await this.saveArticleToDB(title, text);
        alert("文章已成功保存至本地历史！");
      });
    }

    // 3. 文章历史弹窗控制
    const btnOpenArticles = document.getElementById("btnOpenArticles");
    const articlesModal = document.getElementById("articlesModal");
    const btnCloseArticlesModal = document.getElementById("btnCloseArticlesModal");
    const btnCloseArticlesBtn = document.getElementById("btnCloseArticlesBtn");
    const btnNewArticle = document.getElementById("btnNewArticle");
    const articleSearchInput = document.getElementById("articleSearchInput");

    if (btnOpenArticles && articlesModal) {
      btnOpenArticles.addEventListener("click", () => {
        articlesModal.classList.remove("hidden");
        this.renderArticleList();
      });
    }

    const closeArticles = () => { if (articlesModal) articlesModal.classList.add("hidden"); };
    if (btnCloseArticlesModal) btnCloseArticlesModal.addEventListener("click", closeArticles);
    if (btnCloseArticlesBtn) btnCloseArticlesBtn.addEventListener("click", closeArticles);

    if (btnNewArticle) {
      btnNewArticle.addEventListener("click", () => {
        this.currentArticleId = null;
        this.currentArticleTitle = "";
        this.currentArticleText = "";
        articleTitleInput.value = "";
        articleInput.value = "";
        this.switchMode("edit");
        closeArticles();
      });
    }

    if (articleSearchInput) {
      articleSearchInput.addEventListener("input", (e) => {
        this.renderArticleList(e.target.value);
      });
    }

    // 4. 示例文档选择
    const sampleSelect = document.getElementById("sampleSelect");
    if (sampleSelect) {
      sampleSelect.innerHTML = `<option value="" disabled selected>📖 经典示例阅读...</option>` +
        SAMPLE_ARTICLES.map(a => `<option value="${a.id}">[${a.category}] ${a.title}</option>`).join("");

      sampleSelect.addEventListener("change", (e) => {
        const id = e.target.value;
        if (id) {
          this.loadSampleArticle(id);
          sampleSelect.value = "";
        }
      });
    }

    // 5. 导入本地 TXT 文件
    const fileInput = document.getElementById("fileInput");
    const btnImportFile = document.getElementById("btnImportFile");
    if (btnImportFile && fileInput) {
      btnImportFile.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          const content = event.target.result;
          const fileName = file.name.replace(/\.[^/.]+$/, "");
          articleTitleInput.value = fileName;
          articleInput.value = content;
          this.currentArticleTitle = fileName;
          this.currentArticleText = content;
          this.reader.loadArticle(content);
          this.switchMode("read");
          await this.autoSaveCurrentArticle();
        };
        reader.readAsText(file);
      });
    }

    // 6. 清空输入
    const btnClearInput = document.getElementById("btnClearInput");
    if (btnClearInput) {
      btnClearInput.addEventListener("click", () => {
        if (confirm("确定要清空文本框内容吗？")) {
          articleTitleInput.value = "";
          articleInput.value = "";
          articleInput.focus();
        }
      });
    }

    // 7. 朗读控制条 (底部悬浮播放器)
    const btnPlayArticle = document.getElementById("btnPlayArticle");
    const btnPauseArticle = document.getElementById("btnPauseArticle");
    const btnStopArticle = document.getElementById("btnStopArticle");
    const btnPrevSentence = document.getElementById("btnPrevSentence");
    const btnNextSentence = document.getElementById("btnNextSentence");
    const rateSelect = document.getElementById("rateSelect");

    if (btnPlayArticle) {
      btnPlayArticle.addEventListener("click", () => this.startOrResumePlayback());
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
        if (cur > 0) window.speechEngine.jumpToSentence(cur - 1);
      });
    }

    if (btnNextSentence) {
      btnNextSentence.addEventListener("click", () => {
        const cur = window.speechEngine.currentSentenceIdx;
        const total = this.reader.getSentenceList().length;
        if (cur < total - 1) window.speechEngine.jumpToSentence(cur + 1);
      });
    }

    if (rateSelect) {
      rateSelect.addEventListener("change", (e) => {
        window.speechEngine.setRate(parseFloat(e.target.value));
      });
    }

    // 8. 快捷音色切换与试听
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

    // 9. 生词本与 SM-2 抽屉
    this.bindVocabDrawerEvents();

    // 10. 设置弹窗控制与备份
    this.bindSettingsModalEvents();

    // 11. 词典管理弹窗
    this.bindDictModalEvents();

    // 12. 补充释义弹窗
    this.bindEditDefModalEvents();
  }

  bindVocabDrawerEvents() {
    const btnOpenVocab = document.getElementById("btnOpenVocab");
    const btnCloseVocab = document.getElementById("btnCloseVocab");
    const vocabDrawer = document.getElementById("vocabDrawer");
    const btnExportCSV = document.getElementById("btnExportCSV");
    const btnExportTXT = document.getElementById("btnExportTXT");
    const btnClearVocab = document.getElementById("btnClearVocab");
    const vocabSearchInput = document.getElementById("vocabSearchInput");

    const tabVocabList = document.getElementById("tabVocabList");
    const tabVocabReview = document.getElementById("tabVocabReview");
    const vocabListView = document.getElementById("vocabListView");
    const vocabReviewView = document.getElementById("vocabReviewView");

    if (btnOpenVocab && vocabDrawer) {
      btnOpenVocab.addEventListener("click", () => {
        vocabDrawer.classList.add("open");
        this.renderVocabList();
        this.updateVocabBadges();
      });
    }

    if (btnCloseVocab && vocabDrawer) {
      btnCloseVocab.addEventListener("click", () => {
        vocabDrawer.classList.remove("open");
      });
    }

    if (tabVocabList && tabVocabReview) {
      tabVocabList.addEventListener("click", () => {
        tabVocabList.classList.add("active");
        tabVocabReview.classList.remove("active");
        vocabListView.style.display = "flex";
        vocabReviewView.style.display = "none";
        this.renderVocabList();
      });

      tabVocabReview.addEventListener("click", () => {
        tabVocabReview.classList.add("active");
        tabVocabList.classList.remove("active");
        vocabListView.style.display = "none";
        vocabReviewView.style.display = "flex";
        this.initReviewSession();
      });
    }

    if (vocabSearchInput) {
      vocabSearchInput.addEventListener("input", (e) => {
        this.renderVocabList(e.target.value);
      });
    }

    if (btnExportCSV) btnExportCSV.addEventListener("click", () => window.vocabManager.exportCSV());
    if (btnExportTXT) btnExportTXT.addEventListener("click", () => window.vocabManager.exportTXT());
    if (btnClearVocab) {
      btnClearVocab.addEventListener("click", () => {
        if (confirm("确定要清空全部生词吗？此操作无法撤销。")) {
          window.vocabManager.clearAll();
          this.renderVocabList();
        }
      });
    }

    // 绑定记忆卡片翻转与打分
    const btnRevealCard = document.getElementById("btnRevealCard");
    const cardDefBox = document.getElementById("cardDefBox");
    const cardRatingGroup = document.getElementById("cardRatingGroup");

    if (btnRevealCard) {
      btnRevealCard.addEventListener("click", () => {
        btnRevealCard.style.display = "none";
        if (cardDefBox) cardDefBox.style.display = "block";
        if (cardRatingGroup) cardRatingGroup.style.display = "grid";
      });
    }

    if (cardRatingGroup) {
      const ratingBtns = cardRatingGroup.querySelectorAll(".rating-btn");
      ratingBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const q = parseInt(btn.getAttribute("data-quality"), 10);
          this.handleCardScore(q);
        });
      });
    }

    // 监听生词变化更新角标
    window.addEventListener("vocabChanged", () => {
      this.updateVocabBadges();
    });
  }

  updateVocabBadges() {
    const count = window.vocabManager.getCount();
    const dueCount = window.vocabManager.getDueCards().length;

    const badge = document.getElementById("vocabBadge");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "inline-block" : "none";
    }

    const tabCount = document.getElementById("vocabTabCount");
    if (tabCount) tabCount.textContent = count;

    const tabDueCount = document.getElementById("vocabDueCount");
    if (tabDueCount) tabDueCount.textContent = dueCount;
  }

  initReviewSession() {
    this.dueCards = window.vocabManager.getDueCards();
    this.currentReviewIdx = 0;
    this.renderCurrentCard();
  }

  renderCurrentCard() {
    const progressText = document.getElementById("reviewProgressText");
    const indexText = document.getElementById("reviewCurrentIndexText");
    const cardWord = document.getElementById("cardWord");
    const cardPhonetic = document.getElementById("cardPhonetic");
    const cardTranslation = document.getElementById("cardTranslation");
    const cardSentence = document.getElementById("cardSentence");
    const btnRevealCard = document.getElementById("btnRevealCard");
    const cardDefBox = document.getElementById("cardDefBox");
    const cardRatingGroup = document.getElementById("cardRatingGroup");

    if (this.dueCards.length === 0 || this.currentReviewIdx >= this.dueCards.length) {
      if (progressText) progressText.textContent = "🎉 今日复习任务已完成！";
      if (indexText) indexText.textContent = "";
      if (cardWord) cardWord.textContent = "干得漂亮！";
      if (cardPhonetic) cardPhonetic.textContent = "All cards reviewed.";
      if (btnRevealCard) btnRevealCard.style.display = "none";
      if (cardDefBox) cardDefBox.style.display = "none";
      if (cardRatingGroup) cardRatingGroup.style.display = "none";
      return;
    }

    const card = this.dueCards[this.currentReviewIdx];
    if (progressText) progressText.textContent = `待复习: ${this.dueCards.length - this.currentReviewIdx} 张`;
    if (indexText) indexText.textContent = `第 ${this.currentReviewIdx + 1} / ${this.dueCards.length} 张`;

    if (cardWord) cardWord.textContent = card.word;
    if (cardPhonetic) cardPhonetic.textContent = card.phonetic ? `/${card.phonetic}/` : "";
    if (cardTranslation) cardTranslation.textContent = card.translation || "暂无释义";
    if (cardSentence) cardSentence.textContent = card.sentence || "暂无语境例句";

    if (btnRevealCard) btnRevealCard.style.display = "inline-block";
    if (cardDefBox) cardDefBox.style.display = "none";
    if (cardRatingGroup) cardRatingGroup.style.display = "none";

    // 播放该词发音
    window.speechEngine.speakWord(card.word);
  }

  handleCardScore(quality) {
    if (this.currentReviewIdx < this.dueCards.length) {
      const card = this.dueCards[this.currentReviewIdx];
      window.vocabManager.reviewCard(card.id, quality);
      this.currentReviewIdx++;
      this.renderCurrentCard();
      this.updateVocabBadges();
    }
  }

  bindSettingsModalEvents() {
    const btnOpenSettings = document.getElementById("btnOpenSettings");
    const settingsModal = document.getElementById("settingsModal");
    const btnCloseSettings = document.getElementById("btnCloseSettings");
    const btnCloseSettingsFooter = document.getElementById("btnCloseSettingsFooter");

    const settingsVoicePresetSelect = document.getElementById("settingsVoicePresetSelect");
    const settingsExactVoiceSelect = document.getElementById("settingsExactVoiceSelect");
    const btnPreviewExactVoice = document.getElementById("btnPreviewExactVoice");

    const autoSpeakCheckbox = document.getElementById("autoSpeakCheckbox");
    const examHighlightCheckbox = document.getElementById("examHighlightCheckbox");
    const examHighlightSelect = document.getElementById("examHighlightSelect");

    const btnExportBackupJSON = document.getElementById("btnExportBackupJSON");
    const btnImportBackupJSON = document.getElementById("btnImportBackupJSON");
    const backupFileInput = document.getElementById("backupFileInput");

    if (btnOpenSettings && settingsModal) {
      btnOpenSettings.addEventListener("click", () => {
        settingsModal.classList.remove("hidden");
        this.populateExactVoiceOptions();
      });
    }

    const closeSettings = () => { if (settingsModal) settingsModal.classList.add("hidden"); };
    if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeSettings);
    if (btnCloseSettingsFooter) btnCloseSettingsFooter.addEventListener("click", closeSettings);

    if (settingsVoicePresetSelect) {
      settingsVoicePresetSelect.addEventListener("change", (e) => {
        window.speechEngine.setPreset(e.target.value);
        const playerSelect = document.getElementById("voicePresetSelect");
        if (playerSelect) playerSelect.value = e.target.value;
      });
    }

    if (settingsExactVoiceSelect) {
      settingsExactVoiceSelect.addEventListener("change", (e) => {
        const uri = e.target.value;
        if (uri) {
          window.speechEngine.selectExactVoice(uri);
        } else {
          window.speechEngine.exactVoiceURI = null;
          try { localStorage.removeItem("english_reader_exact_voice"); } catch (err) {}
          window.speechEngine.applyCurrentSelection();
        }
      });
    }

    if (btnPreviewExactVoice) {
      btnPreviewExactVoice.addEventListener("click", () => {
        window.speechEngine.previewCurrentVoice();
      });
    }

    if (autoSpeakCheckbox) {
      autoSpeakCheckbox.addEventListener("change", (e) => {
        this.reader.autoSpeakOnClick = e.target.checked;
      });
    }

    if (examHighlightCheckbox && examHighlightSelect) {
      examHighlightCheckbox.addEventListener("change", (e) => {
        const enabled = e.target.checked;
        this.reader.examHighlightEnabled = enabled;
        examHighlightSelect.style.display = enabled ? "block" : "none";
        if (this.currentArticleText) {
          this.reader.loadArticle(this.currentArticleText);
        }
      });

      examHighlightSelect.addEventListener("change", (e) => {
        this.reader.examHighlightType = e.target.value;
        if (this.reader.examHighlightEnabled && this.currentArticleText) {
          this.reader.loadArticle(this.currentArticleText);
        }
      });
    }

    // 数据备份与还原
    if (btnExportBackupJSON) {
      btnExportBackupJSON.addEventListener("click", () => this.exportAllDataBackup());
    }

    if (btnImportBackupJSON && backupFileInput) {
      btnImportBackupJSON.addEventListener("click", () => backupFileInput.click());
      backupFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = async (evt) => {
          await this.importDataBackup(evt.target.result);
        };
        r.readAsText(file);
      });
    }
  }

  populateExactVoiceOptions() {
    const select = document.getElementById("settingsExactVoiceSelect");
    if (!select || !window.speechEngine) return;

    const voices = window.speechEngine.englishVoices || [];
    const currentVoice = window.speechEngine.selectedVoice;
    const exactURI = window.speechEngine.exactVoiceURI;

    let html = `<option value="">跟随上方快速预设</option>`;
    for (const v of voices) {
      const score = window.speechEngine.getVoiceQualityScore(v);
      const qualityTag = score >= 100 ? "🌟 [Natural] " : score >= 80 ? "✨ [Enhanced] " : score >= 40 ? "🍎 [Siri] " : "";
      const val = v.voiceURI || v.name;
      const isSelected = exactURI ? (val === exactURI) : (currentVoice && (v === currentVoice));
      html += `<option value="${this.escapeHtml(val)}" ${isSelected ? "selected" : ""}>${qualityTag}${this.escapeHtml(v.name)} (${this.escapeHtml(v.lang)})</option>`;
    }
    select.innerHTML = html;
  }

  async exportAllDataBackup() {
    try {
      const backupData = {
        version: "2.0.0",
        timestamp: new Date().toISOString(),
        articles: window.localDB ? await window.localDB.getAllArticles() : [],
        vocab: window.vocabManager ? window.vocabManager.getAll() : [],
        customDict: window.DictEngine ? window.DictEngine.customDict : {},
        settings: {
          rate: window.speechEngine ? window.speechEngine.rate : 1.0,
          preset: window.speechEngine ? window.speechEngine.currentPresetKey : "us_female",
          exactVoice: window.speechEngine ? window.speechEngine.exactVoiceURI : null,
          theme: this.currentTheme,
          fontSize: this.fontSize,
          fontFamily: this.fontFamily
        }
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `英语点读助手_全量备份_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("导出备份数据失败: " + e.message);
    }
  }

  async importDataBackup(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      if (!data || typeof data !== "object") throw new Error("无效的备份文件结构");

      // 1. 恢复自定义词库
      if (data.customDict && window.DictEngine) {
        window.DictEngine.customDict = data.customDict;
        window.DictEngine.saveCustomDict();
      }

      // 2. 恢复生词本
      if (Array.isArray(data.vocab) && window.vocabManager) {
        window.vocabManager.vocabList = data.vocab;
        window.vocabManager.save();
      }

      // 3. 恢复历史文章
      if (Array.isArray(data.articles) && window.localDB) {
        for (const art of data.articles) {
          await window.localDB.saveArticle(art);
        }
      }

      alert("全量备份数据恢复成功！");
      this.renderVocabList();
      this.updateDictStats();
      this.updateVocabBadges();
      const settingsModal = document.getElementById("settingsModal");
      if (settingsModal) settingsModal.classList.add("hidden");
    } catch (e) {
      alert("导入备份失败: " + e.message);
    }
  }

  bindDictModalEvents() {
    const btnOpenDictMgr = document.getElementById("btnOpenDictMgr");
    const dictModal = document.getElementById("dictModal");
    const btnCloseDictModal = document.getElementById("btnCloseDictModal");
    const btnCloseDictModalFooter = document.getElementById("btnCloseDictModalFooter");
    const btnDoImportDict = document.getElementById("btnDoImportDict");
    const btnUploadDictFile = document.getElementById("btnUploadDictFile");
    const dictFileInput = document.getElementById("dictFileInput");
    const dictImportText = document.getElementById("dictImportText");
    const btnExportDictJSON = document.getElementById("btnExportDictJSON");
    const btnExportDictCSV = document.getElementById("btnExportDictCSV");
    const btnClearCustomDict = document.getElementById("btnClearCustomDict");

    if (btnOpenDictMgr && dictModal) {
      btnOpenDictMgr.addEventListener("click", () => {
        dictModal.classList.remove("hidden");
        this.updateDictStats();
      });
    }

    const closeDict = () => { if (dictModal) dictModal.classList.add("hidden"); };
    if (btnCloseDictModal) btnCloseDictModal.addEventListener("click", closeDict);
    if (btnCloseDictModalFooter) btnCloseDictModalFooter.addEventListener("click", closeDict);

    if (btnDoImportDict && dictImportText) {
      btnDoImportDict.addEventListener("click", () => {
        const text = dictImportText.value.trim();
        if (!text) {
          alert("请输入要导入的词典内容！");
          return;
        }
        this.importCustomDictText(text);
        dictImportText.value = "";
      });
    }

    if (btnUploadDictFile && dictFileInput) {
      btnUploadDictFile.addEventListener("click", () => dictFileInput.click());
      dictFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          this.importCustomDictText(evt.target.result);
        };
        reader.readAsText(file);
      });
    }

    if (btnExportDictJSON) {
      btnExportDictJSON.addEventListener("click", () => {
        const dict = window.DictEngine.customDict;
        const jsonStr = JSON.stringify(dict, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `自定义词库_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
    }

    if (btnExportDictCSV) {
      btnExportDictCSV.addEventListener("click", () => {
        const dict = window.DictEngine.customDict;
        let csv = "\uFEFF单词,音标,中文释义\n";
        for (const [w, [ph, def]] of Object.entries(dict)) {
          const escape = t => `"${(t || "").replace(/"/g, '""')}"`;
          csv += `${escape(w)},${escape(ph)},${escape(def)}\n`;
        }
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `自定义词库_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      });
    }

    if (btnClearCustomDict) {
      btnClearCustomDict.addEventListener("click", () => {
        if (confirm("确定要清空自定义词库数据吗？")) {
          window.DictEngine.customDict = {};
          window.DictEngine.saveCustomDict();
          this.updateDictStats();
        }
      });
    }
  }

  importCustomDictText(rawText) {
    let count = 0;
    try {
      // 1. 尝试 JSON
      if (rawText.trim().startsWith("{")) {
        const obj = JSON.parse(rawText);
        for (const [k, v] of Object.entries(obj)) {
          if (Array.isArray(v)) {
            window.DictEngine.setCustomWord(k, v[0] || "", v[1] || "");
            count++;
          } else if (typeof v === "string") {
            window.DictEngine.setCustomWord(k, "", v);
            count++;
          }
        }
      } else {
        // 2. 逐行 CSV / 冒号解析
        const lines = rawText.split("\n");
        for (const line of lines) {
          const l = line.trim();
          if (!l) continue;
          if (l.includes(",")) {
            const parts = l.split(",");
            const w = parts[0].trim();
            const ph = parts.length > 2 ? parts[1].trim() : "";
            const def = parts.length > 2 ? parts.slice(2).join(",").trim() : parts[1].trim();
            if (w && def) {
              window.DictEngine.setCustomWord(w, ph, def);
              count++;
            }
          } else if (l.includes(":") || l.includes("：")) {
            const sep = l.includes(":") ? ":" : "：";
            const parts = l.split(sep);
            const w = parts[0].trim();
            const def = parts.slice(1).join(sep).trim();
            if (w && def) {
              window.DictEngine.setCustomWord(w, "", def);
              count++;
            }
          }
        }
      }
      alert(`导入成功！共写入 ${count} 条自定义词汇。`);
      this.updateDictStats();
    } catch (e) {
      alert("导入失败，格式可能有误: " + e.message);
    }
  }

  bindEditDefModalEvents() {
    const editDefModal = document.getElementById("editDefModal");
    const btnCloseEditDef = document.getElementById("btnCloseEditDef");
    const btnCancelDef = document.getElementById("btnCancelDef");
    const btnSaveDef = document.getElementById("btnSaveDef");

    const close = () => { if (editDefModal) editDefModal.classList.add("hidden"); };
    if (btnCloseEditDef) btnCloseEditDef.addEventListener("click", close);
    if (btnCancelDef) btnCancelDef.addEventListener("click", close);

    if (btnSaveDef) {
      btnSaveDef.addEventListener("click", () => {
        const word = document.getElementById("editDefWord").value.trim();
        const phonetic = document.getElementById("editDefPhonetic").value.trim();
        const trans = document.getElementById("editDefTranslation").value.trim();
        if (!word || !trans) {
          alert("单词与释义不能为空！");
          return;
        }
        window.DictEngine.setCustomWord(word, phonetic, trans);
        if (window.vocabManager.hasWord(word)) {
          window.vocabManager.addWord(word, phonetic, trans);
        }
        close();
        alert(`已记住单词「${word}」的自定义释义！`);
        this.updateDictStats();
      });
    }
  }

  openEditDefModal(word, currentDef = "") {
    const editDefModal = document.getElementById("editDefModal");
    const editDefWord = document.getElementById("editDefWord");
    const editDefPhonetic = document.getElementById("editDefPhonetic");
    const editDefTranslation = document.getElementById("editDefTranslation");

    if (editDefModal && editDefWord) {
      editDefWord.value = word;
      editDefPhonetic.value = "";
      editDefTranslation.value = currentDef;
      editDefModal.classList.remove("hidden");
    }
  }

  updateDictStats() {
    const summary = document.getElementById("dictStatsSummary");
    if (!summary || !window.DictEngine) return;
    const stats = window.DictEngine.getStats();
    summary.innerHTML = `📚 离线总词汇: <strong>150,000+</strong> 词条 &nbsp;|&nbsp; 自定义词条: <strong>${stats.customCount}</strong> &nbsp;|&nbsp; 当前活跃分片: <strong>${stats.totalLoadedShards}</strong>`;
  }

  async autoSaveCurrentArticle() {
    if (!this.currentArticleText) return;
    await this.saveArticleToDB(this.currentArticleTitle, this.currentArticleText);
  }

  async saveArticleToDB(title, content) {
    if (!window.localDB) return;
    const art = {
      id: this.currentArticleId || ("art_" + Date.now()),
      title: title || "我的文章",
      content: content,
      lastReadSentenceIdx: this.reader ? this.reader.currentSentenceIdx : 0
    };
    const saved = await window.localDB.saveArticle(art);
    this.currentArticleId = saved.id;
    await window.localDB.setSetting("last_reading_article_id", saved.id);
  }

  async renderArticleList(filterQuery = "") {
    const container = document.getElementById("articleListContainer");
    if (!container || !window.localDB) return;

    const list = await window.localDB.getAllArticles();
    const q = (filterQuery || "").toLowerCase().trim();
    const filtered = q ? list.filter(a => (a.title || "").toLowerCase().includes(q) || (a.content || "").toLowerCase().includes(q)) : list;

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem 0;">${q ? "未找到匹配文章" : "暂无历史文章，点击下方「➕ 新建文章」开始点读！"}</div>`;
      return;
    }

    let html = "";
    for (const item of filtered) {
      const dateStr = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "";
      const wordCount = (item.content || "").split(/\s+/).filter(Boolean).length;
      const readIdx = item.lastReadSentenceIdx >= 0 ? `第 ${item.lastReadSentenceIdx + 1} 句` : "未开始";

      html += `
        <div class="article-item" data-id="${this.escapeHtml(item.id)}">
          <div class="article-info">
            <span class="article-title-text">${this.escapeHtml(item.title || "未命名文章")}</span>
            <div class="article-meta">
              <span>${wordCount} 词</span>
              <span>${dateStr}</span>
              <span class="article-progress-pill">${readIdx}</span>
            </div>
          </div>
          <div class="article-item-actions">
            <button class="action-btn primary btn-open-art" data-id="${this.escapeHtml(item.id)}" style="font-size: 0.8rem; padding: 0.4rem 0.65rem;">阅读</button>
            <button class="action-btn btn-rename-art" data-id="${this.escapeHtml(item.id)}" style="font-size: 0.8rem; padding: 0.4rem 0.5rem;" title="重命名">✏️</button>
            <button class="action-btn btn-del-art" data-id="${this.escapeHtml(item.id)}" style="color: #ef4444; font-size: 0.8rem; padding: 0.4rem 0.5rem;" title="删除">🗑️</button>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    // 绑定列表项操作
    container.querySelectorAll(".btn-open-art").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const art = await window.localDB.getArticle(id);
        if (art) {
          this.loadArticleData(art);
          const articlesModal = document.getElementById("articlesModal");
          if (articlesModal) articlesModal.classList.add("hidden");
        }
      });
    });

    container.querySelectorAll(".btn-rename-art").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const art = await window.localDB.getArticle(id);
        if (art) {
          const newTitle = prompt("修改文章标题:", art.title || "");
          if (newTitle && newTitle.trim()) {
            art.title = newTitle.trim();
            await window.localDB.saveArticle(art);
            this.renderArticleList(filterQuery);
          }
        }
      });
    });

    container.querySelectorAll(".btn-del-art").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (confirm("确定要删除这篇历史文章吗？")) {
          await window.localDB.deleteArticle(id);
          this.renderArticleList(filterQuery);
        }
      });
    });
  }

  loadArticleData(article) {
    this.currentArticleId = article.id;
    this.currentArticleTitle = article.title || "";
    this.currentArticleText = article.content || "";

    const titleInput = document.getElementById("articleTitleInput");
    const input = document.getElementById("articleInput");
    if (titleInput) titleInput.value = this.currentArticleTitle;
    if (input) input.value = this.currentArticleText;

    this.reader.loadArticle(this.currentArticleText);
    this.switchMode("read");

    // 恢复句子定位
    if (article.lastReadSentenceIdx >= 0) {
      setTimeout(() => {
        this.reader.highlightSentence(article.lastReadSentenceIdx);
      }, 100);
    }
  }

  loadSampleArticle(id) {
    const sample = SAMPLE_ARTICLES.find(a => a.id === id);
    if (!sample) return;
    this.currentArticleId = "sample_" + sample.id;
    this.currentArticleTitle = sample.title;
    this.currentArticleText = sample.text;

    const titleInput = document.getElementById("articleTitleInput");
    const input = document.getElementById("articleInput");
    if (titleInput) titleInput.value = sample.title;
    if (input) input.value = sample.text;

    this.reader.loadArticle(sample.text);
    this.switchMode("read");
  }

  switchMode(mode) {
    const editView = document.getElementById("editView");
    const readView = document.getElementById("readView");
    const btnSwitchRead = document.getElementById("btnSwitchRead");
    const btnSwitchEdit = document.getElementById("btnSwitchEdit");

    if (mode === "edit") {
      if (editView) editView.style.display = "block";
      if (readView) readView.style.display = "none";
      if (btnSwitchEdit) btnSwitchEdit.classList.add("active");
      if (btnSwitchRead) btnSwitchRead.classList.remove("active");
      window.speechEngine.stop();
    } else {
      if (editView) editView.style.display = "none";
      if (readView) readView.style.display = "block";
      if (btnSwitchRead) btnSwitchRead.classList.add("active");
      if (btnSwitchEdit) btnSwitchEdit.classList.remove("active");
    }
  }

  startOrResumePlayback() {
    const sentences = this.reader.getSentenceList();
    if (!sentences || sentences.length === 0) {
      alert("请先加载或输入一篇文章后再朗读！");
      return;
    }

    if (window.speechEngine.isPaused) {
      window.speechEngine.resume();
      this.updatePlayerControls(true, false);
      return;
    }

    let startIdx = 0;
    if (this.reader.currentSentenceIdx >= 0) {
      startIdx = this.reader.currentSentenceIdx;
    }

    this.updatePlayerControls(true, false);

    window.speechEngine.startArticlePlayback(sentences, startIdx, {
      onSentenceStart: (idx) => {
        this.reader.highlightSentence(idx);
        this.updateSentenceProgress(idx, sentences.length);
        // 自动更新阅读进度至 IndexedDB
        if (this.currentArticleId && window.localDB) {
          window.localDB.saveArticle({
            id: this.currentArticleId,
            title: this.currentArticleTitle,
            content: this.currentArticleText,
            lastReadSentenceIdx: idx
          }).catch(() => {});
        }
      },
      onArticleEnd: () => {
        this.reader.clearSentenceHighlight();
        this.updatePlayerControls(false, false);
        this.updateSentenceProgress(sentences.length, sentences.length);
      }
    });
  }

  updatePlayerControls(isPlaying, isPaused) {
    const btnPlay = document.getElementById("btnPlayArticle");
    const btnPause = document.getElementById("btnPauseArticle");

    if (btnPlay && btnPause) {
      if (isPlaying) {
        btnPlay.style.display = "none";
        btnPause.style.display = "inline-flex";
      } else {
        btnPlay.style.display = "inline-flex";
        btnPause.style.display = "none";
      }
    }
  }

  updateSentenceProgress(currentIdx, totalCount) {
    const progressEl = document.getElementById("playerSentenceProgress");
    if (progressEl) {
      progressEl.textContent = `第 ${currentIdx + 1} / ${totalCount} 句`;
    }
  }

  initVoicePresetsUI() {
    window.addEventListener("voicesReady", (e) => {
      const current = e.detail.currentPreset;
      const voicePresetSelect = document.getElementById("voicePresetSelect");
      const settingsPreset = document.getElementById("settingsVoicePresetSelect");
      if (voicePresetSelect) voicePresetSelect.value = current;
      if (settingsPreset) settingsPreset.value = current;
      this.populateExactVoiceOptions();
    });

    window.addEventListener("voicePresetChanged", (e) => {
      const key = e.detail.presetKey;
      const voicePresetSelect = document.getElementById("voicePresetSelect");
      const settingsPreset = document.getElementById("settingsVoicePresetSelect");
      if (voicePresetSelect) voicePresetSelect.value = key;
      if (settingsPreset) settingsPreset.value = key;
    });
  }

  initThemeAndFont() {
    const themeButtons = document.querySelectorAll(".theme-btn");
    themeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        themeButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const theme = btn.getAttribute("data-theme");
        document.body.className = `theme-${theme}`;
        this.currentTheme = theme;
      });
    });

    const fontButtons = document.querySelectorAll(".font-btn");
    const readerContent = document.getElementById("readerContent");
    fontButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        fontButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const f = btn.getAttribute("data-font");
        if (readerContent) {
          readerContent.style.fontFamily = f === "serif" ? "Georgia, Cambria, serif" :
                                           f === "sans" ? "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" :
                                           "Consolas, Monaco, monospace";
        }
        this.fontFamily = f;
      });
    });

    const slider = document.getElementById("fontSizeSlider");
    const valText = document.getElementById("fontSizeValue");
    if (slider && valText && readerContent) {
      slider.addEventListener("input", (e) => {
        const val = e.target.value;
        valText.textContent = `${val}px`;
        readerContent.style.fontSize = `${val}px`;
        this.fontSize = parseInt(val, 10);
      });
    }
  }

  renderVocabList(filterText = "") {
    const container = document.getElementById("vocabListContainer");
    if (!container) return;

    let list = window.vocabManager.getAll();
    if (filterText) {
      const q = filterText.toLowerCase();
      list = list.filter(item => item.word.toLowerCase().includes(q) || (item.translation || "").includes(q));
    }

    if (list.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">${filterText ? "未检索到匹配生词" : "生词本空空如也，点词阅读时点击「☆ 存入生词本」即可随时温故！"}</div>`;
      this.updateVocabBadges();
      return;
    }

    let html = "";
    list.forEach(item => {
      const ph = item.phonetic ? `/${item.phonetic}/` : "";
      html += `
        <div class="vocab-card" data-word="${this.escapeHtml(item.word)}">
          <div class="vocab-card-header">
            <div>
              <span class="vocab-word">${this.escapeHtml(item.word)}</span>
              <span class="vocab-phonetic">${this.escapeHtml(ph)}</span>
            </div>
            <div style="display: flex; gap: 0.2rem;">
              <button class="vocab-btn-action btn-speak-vocab" data-word="${this.escapeHtml(item.word)}" title="发音">🔊</button>
              <button class="vocab-btn-action btn-del-vocab" data-word="${this.escapeHtml(item.word)}" style="color: #ef4444;" title="删除">✕</button>
            </div>
          </div>
          <div class="vocab-translation">${this.escapeHtml(item.translation || "暂无释义")}</div>
          ${item.sentence ? `<div class="vocab-sentence">“${this.escapeHtml(item.sentence)}”</div>` : ""}
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll(".btn-speak-vocab").forEach(btn => {
      btn.addEventListener("click", () => {
        window.speechEngine.speakWord(btn.getAttribute("data-word"));
      });
    });

    container.querySelectorAll(".btn-del-vocab").forEach(btn => {
      btn.addEventListener("click", () => {
        const w = btn.getAttribute("data-word");
        window.vocabManager.removeWord(w);
        this.renderVocabList(filterText);
      });
    });

    this.updateVocabBadges();
  }

  escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

window.app = new AppController();
