/**
 * 本地生词本与间隔复习引擎 (Vocabulary Book & SM-2 Spaced Repetition Engine)
 * 100% 本地运行，通过 localStorage 与 IndexedDB 双重持久化
 * 支持生词添加、删除、查重、发音、语境句保存、SM-2 算法间隔记忆卡片、导出为 CSV / TXT (支持 Anki)
 */

class VocabManager {
  constructor() {
    this.storageKey = "english_reader_vocab_list";
    this.vocabList = [];
    this.currentReviewCardIndex = 0;
    this.isAnswerRevealed = false;

    this.load();
    this.initSyncWithDB();
  }

  load() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        this.vocabList = JSON.parse(data);
      } else {
        this.vocabList = [];
      }
    } catch (e) {
      console.warn("加载生词本失败:", e);
      this.vocabList = [];
    }
  }

  async initSyncWithDB() {
    // 平滑同步至 IndexedDB
    if (window.localDB) {
      try {
        const dbList = await window.localDB.getAllVocab();
        if (dbList && dbList.length > 0 && this.vocabList.length === 0) {
          this.vocabList = dbList;
          this.save();
        } else if (this.vocabList.length > 0 && dbList.length === 0) {
          for (const item of this.vocabList) {
            await window.localDB.saveVocab(item);
          }
        }
      } catch (e) {
        console.warn("同步 IndexedDB 生词本失败:", e);
      }
    }
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.vocabList));
      this._emitChange();
    } catch (e) {
      console.warn("保存生词本失败:", e);
    }
  }

  _emitChange() {
    window.dispatchEvent(new CustomEvent("vocabChanged", {
      detail: {
        count: this.vocabList.length,
        dueCount: this.getDueCards().length,
        list: this.vocabList
      }
    }));
  }

  hasWord(word) {
    if (!word) return false;
    const clean = word.toLowerCase().trim();
    return this.vocabList.some(item => item.word.toLowerCase() === clean);
  }

  addWord(word, phonetic = "", translation = "", sentence = "") {
    if (!word) return false;
    const clean = word.trim();
    const key = clean.toLowerCase();

    // 如果已存在则更新释义与句子
    const index = this.vocabList.findIndex(item => item.word.toLowerCase() === key);
    if (index >= 0) {
      if (phonetic) this.vocabList[index].phonetic = phonetic;
      if (translation) this.vocabList[index].translation = translation;
      if (sentence) this.vocabList[index].sentence = sentence;
      this.vocabList[index].updatedAt = new Date().toISOString();
      if (window.localDB) window.localDB.saveVocab(this.vocabList[index]).catch(() => {});
    } else {
      const newItem = {
        id: "w_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        word: clean,
        phonetic: phonetic || "", // 严格不填充伪音标
        translation: translation || "暂无释义",
        sentence: sentence ? sentence.trim() : "",
        createdAt: new Date().toISOString(),
        // SM-2 算法初始化字段
        repetition: 0,
        interval: 0,
        easeFactor: 2.5,
        nextReviewDate: Date.now(), // 初始即待复习
        reviewCount: 0
      };
      this.vocabList.unshift(newItem);
      if (window.localDB) window.localDB.saveVocab(newItem).catch(() => {});
    }

    this.save();
    return true;
  }

  removeWord(word) {
    if (!word) return;
    const key = word.toLowerCase().trim();
    const item = this.vocabList.find(i => i.word.toLowerCase() === key);
    if (item && window.localDB) {
      window.localDB.deleteVocab(item.id).catch(() => {});
    }
    this.vocabList = this.vocabList.filter(item => item.word.toLowerCase() !== key);
    this.save();
  }

  clearAll() {
    this.vocabList = [];
    this.save();
  }

  getAll() {
    return this.vocabList;
  }

  getCount() {
    return this.vocabList.length;
  }

  /**
   * 获取今日到期需复习的卡片列表
   */
  getDueCards() {
    const now = Date.now();
    return this.vocabList.filter(item => {
      if (!item.nextReviewDate) return true;
      return item.nextReviewDate <= now;
    });
  }

  /**
   * SM-2 算法处理单张卡片打分
   * @param {string} id - 单词 ID
   * @param {number} quality - 打分 1(重来), 3(困难), 4(良好), 5(简单)
   */
  reviewCard(id, quality) {
    const item = this.vocabList.find(i => i.id === id);
    if (!item) return null;

    let rep = item.repetition || 0;
    let interval = item.interval || 0;
    let ef = item.easeFactor || 2.5;

    if (quality >= 3) {
      if (rep === 0) {
        interval = 1;
      } else if (rep === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * ef);
      }
      rep += 1;
    } else {
      rep = 0;
      interval = 1;
    }

    // 动态调整易度系数 EF
    ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ef < 1.3) ef = 1.3;

    item.repetition = rep;
    item.interval = interval;
    item.easeFactor = Math.round(ef * 100) / 100;
    item.nextReviewDate = Date.now() + interval * 86400000;
    item.reviewCount = (item.reviewCount || 0) + 1;
    item.lastReviewedAt = new Date().toISOString();

    this.save();
    if (window.localDB) {
      window.localDB.saveVocab(item).catch(() => {});
    }

    return item;
  }

  /**
   * 导出为 CSV 文件
   */
  exportCSV() {
    if (this.vocabList.length === 0) {
      alert("生词本为空，请先在阅读中收藏生词！");
      return;
    }

    let csvContent = "\uFEFF单词,音标,中文释义,例句语境,记忆间隔(天),易度因子,添加时间\n";
    this.vocabList.forEach(item => {
      const escape = (text) => `"${(text || "").replace(/"/g, '""')}"`;
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
      csvContent += `${escape(item.word)},${escape(item.phonetic)},${escape(item.translation)},${escape(item.sentence)},${item.interval || 0},${item.easeFactor || 2.5},${escape(dateStr)}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `英语生词本_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 导出为 Anki / 纯文本格式
   */
  exportTXT() {
    if (this.vocabList.length === 0) {
      alert("生词本为空，请先在阅读中收藏生词！");
      return;
    }

    let txtContent = "";
    this.vocabList.forEach(item => {
      txtContent += `${item.word}\t${item.phonetic}\t${item.translation}\t${item.sentence}\n`;
    });

    const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `英语生词本_Anki格式_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

window.vocabManager = new VocabManager();
