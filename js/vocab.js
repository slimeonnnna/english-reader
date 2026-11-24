/**
 * 本地生词本管理模块 (Vocabulary Book Manager)
 * 100% 本地运行，通过 localStorage 永久持久化保存
 * 支持生词添加、删除、查重、发音、语境句保存、导出为 CSV / TXT (支持 Anki)
 */

class VocabManager {
  constructor() {
    this.storageKey = "english_reader_vocab_list";
    this.vocabList = [];
    this.load();
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
      this.vocabList[index].phonetic = phonetic || this.vocabList[index].phonetic;
      this.vocabList[index].translation = translation || this.vocabList[index].translation;
      if (sentence) this.vocabList[index].sentence = sentence;
      this.vocabList[index].updatedAt = new Date().toISOString();
    } else {
      this.vocabList.unshift({
        id: "w_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        word: clean,
        phonetic: phonetic || `/${key}/`,
        translation: translation || "暂无释义",
        sentence: sentence ? sentence.trim() : "",
        createdAt: new Date().toISOString(),
        reviewCount: 0
      });
    }

    this.save();
    return true;
  }

  removeWord(word) {
    if (!word) return;
    const key = word.toLowerCase().trim();
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
   * 导出为 CSV 文件
   */
  exportCSV() {
    if (this.vocabList.length === 0) {
      alert("生词本为空，请先在阅读中收藏生词！");
      return;
    }

    let csvContent = "\uFEFF单词,音标,中文释义,例句语境,添加时间\n";
    this.vocabList.forEach(item => {
      const escape = (text) => `"${(text || "").replace(/"/g, '""')}"`;
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
      csvContent += `${escape(item.word)},${escape(item.phonetic)},${escape(item.translation)},${escape(item.sentence)},${escape(dateStr)}\n`;
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
