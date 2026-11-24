/**
 * 本地 IndexedDB 数据库引擎 (Local IndexedDB Storage Engine)
 * 统一管理文章、生词卡片、离线词库分片缓存与用户设置
 */

const DB_NAME = "EnglishReaderDB";
const DB_VERSION = 2;

class LocalDB {
  constructor() {
    this.db = null;
    this.initPromise = this._init();
  }

  _init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. 文章存储表
        if (!db.objectStoreNames.contains("articles")) {
          const articleStore = db.createObjectStore("articles", { keyPath: "id" });
          articleStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        // 2. 生词本存储表 (集成 SM-2 算法字段)
        if (!db.objectStoreNames.contains("vocab")) {
          const vocabStore = db.createObjectStore("vocab", { keyPath: "id" });
          vocabStore.createIndex("word", "word", { unique: false });
          vocabStore.createIndex("nextReviewDate", "nextReviewDate", { unique: false });
        }

        // 3. 词典本地分片与词条缓存表
        if (!db.objectStoreNames.contains("dict_cache")) {
          const dictStore = db.createObjectStore("dict_cache", { keyPath: "word" });
        }

        // 4. 用户设置表
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("IndexedDB 打开失败:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  async _getStore(storeName, mode = "readonly") {
    await this.initPromise;
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // --- 文章操作 ---
  async getAllArticles() {
    const store = await this._getStore("articles", "readonly");
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  }

  async getArticle(id) {
    const store = await this._getStore("articles", "readonly");
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async saveArticle(article) {
    if (!article.id) article.id = "art_" + Date.now();
    article.updatedAt = Date.now();
    const store = await this._getStore("articles", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(article);
      req.onsuccess = () => resolve(article);
      req.onerror = (e) => reject(e);
    });
  }

  async deleteArticle(id) {
    const store = await this._getStore("articles", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  // --- 词典缓存操作 ---
  async getDictWord(word) {
    const store = await this._getStore("dict_cache", "readonly");
    return new Promise((resolve) => {
      const req = store.get(word.toLowerCase());
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async saveDictWordsBatch(entries) {
    if (!entries || entries.length === 0) return;
    await this.initPromise;
    return new Promise((resolve) => {
      const tx = this.db.transaction("dict_cache", "readwrite");
      const store = tx.objectStore("dict_cache");
      for (const item of entries) {
        store.put(item);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  // --- 生词本操作 ---
  async getAllVocab() {
    const store = await this._getStore("vocab", "readonly");
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  }

  async saveVocab(item) {
    const store = await this._getStore("vocab", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = (e) => reject(e);
    });
  }

  async deleteVocab(id) {
    const store = await this._getStore("vocab", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  // --- 设置操作 ---
  async getSetting(key, defaultVal = null) {
    const store = await this._getStore("settings", "readonly");
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultVal);
      req.onerror = () => resolve(defaultVal);
    });
  }

  async setSetting(key, value) {
    const store = await this._getStore("settings", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }
}

window.localDB = new LocalDB();
