/**
 * 本地多级词典与分片缓存引擎 (Dictionary Engine V2.0)
 * 优先级: 1. 用户自定义词库 -> 2. 内存热词缓存 -> 3. IndexedDB 本地缓存 -> 4. 按需静态分片加载 -> 5. 词形还原(lemmas)
 * 零 API、零网络服务器依赖、完全支持离线
 */

class DictEngineCore {
  constructor() {
    this.customDict = {};
    this.memoryCache = new Map();
    this.loadedShards = new Set();
    this.lemmas = null;
    this.commonPhrases = null;
    this.loadingPromises = new Map();
    this.init();
  }

  async init() {
    this.loadCustomDict();
    // 异步预加载高频短语库与词形索引
    this.loadCommonPhrases();
    this.loadLemmas();
  }

  loadCustomDict() {
    try {
      const data = localStorage.getItem("english_reader_custom_dict");
      if (data) {
        this.customDict = JSON.parse(data);
      }
    } catch (e) {
      console.warn("加载用户自定义词典失败:", e);
      this.customDict = {};
    }
  }

  saveCustomDict() {
    try {
      localStorage.setItem("english_reader_custom_dict", JSON.stringify(this.customDict));
      window.dispatchEvent(new CustomEvent("customDictUpdated", { detail: { count: Object.keys(this.customDict).length } }));
    } catch (e) {
      console.error("保存用户词典失败:", e);
    }
  }

  setCustomWord(word, phonetic, translation) {
    if (!word) return;
    const clean = word.toLowerCase().trim();
    this.customDict[clean] = [phonetic || "", translation || ""];
    this.saveCustomDict();
  }

  removeCustomWord(word) {
    if (!word) return;
    const clean = word.toLowerCase().trim();
    if (this.customDict[clean]) {
      delete this.customDict[clean];
      this.saveCustomDict();
    }
  }

  async loadLemmas() {
    if (this.lemmas) return this.lemmas;
    try {
      const res = await fetch("dict/shards/lemmas.json");
      if (res.ok) {
        this.lemmas = await res.json();
      }
    } catch (e) {
      this.lemmas = {};
    }
    return this.lemmas || {};
  }

  async loadCommonPhrases() {
    if (this.commonPhrases) return this.commonPhrases;
    try {
      const res = await fetch("dict/shards/common_phrases.json");
      if (res.ok) {
        this.commonPhrases = await res.json();
      }
    } catch (e) {
      this.commonPhrases = {};
    }
    return this.commonPhrases || {};
  }

  /**
   * 异步加载指定字母的词汇分片
   */
  async loadLetterShard(letter) {
    const l = letter.toLowerCase();
    if (this.loadedShards.has(l)) return true;
    if (this.loadingPromises.has(l)) return this.loadingPromises.get(l);

    const promise = (async () => {
      try {
        const res = await fetch(`dict/shards/${l}.json`);
        if (res.ok) {
          const data = await res.json();
          // 写入本地 IndexedDB 缓存以便断网秒开
          const batch = [];
          for (const [w, val] of Object.entries(data)) {
            batch.push({
              word: w,
              p: val.p || "",
              t: val.t || "",
              c: val.c || "",
              f: val.f || 0,
              e: val.e || ""
            });
            // 写入快速内存缓存
            this.memoryCache.set(w, val);
          }
          if (window.localDB && batch.length > 0) {
            window.localDB.saveDictWordsBatch(batch).catch(() => {});
          }
          this.loadedShards.add(l);
          return true;
        }
      } catch (e) {
        console.warn(`加载词典分片 ${l}.json 失败:`, e);
      } finally {
        this.loadingPromises.delete(l);
      }
      return false;
    })();

    this.loadingPromises.set(l, promise);
    return promise;
  }

  /**
   * 异步加载短语分片
   */
  async loadPhraseShard(letter) {
    const key = "p_" + letter.toLowerCase();
    if (this.loadedShards.has(key)) return true;
    if (this.loadingPromises.has(key)) return this.loadingPromises.get(key);

    const promise = (async () => {
      try {
        const res = await fetch(`dict/shards/phrase_${letter}.json`);
        if (res.ok) {
          const data = await res.json();
          for (const [ph, val] of Object.entries(data)) {
            this.memoryCache.set(ph, val);
          }
          this.loadedShards.add(key);
          return true;
        }
      } catch (e) {
        console.warn(`加载短语分片 phrase_${letter}.json 失败:`, e);
      } finally {
        this.loadingPromises.delete(key);
      }
      return false;
    })();

    this.loadingPromises.set(key, promise);
    return promise;
  }

  /**
   * 同步快速查词 (用于即时响应首屏与内存已有词条)
   */
  lookupSync(rawWord) {
    if (!rawWord) return null;
    const clean = rawWord.toLowerCase().trim().replace(/^[^a-zA-Z\s\-]+|[^a-zA-Z\s\-]+$/g, "");
    if (!clean) return null;

    // 1. 用户自定义词库 (最高优先级)
    if (this.customDict[clean]) {
      const [ph, def] = this.customDict[clean];
      return {
        found: true,
        query: clean,
        lemma: clean,
        phonetic: ph || "",
        translation: def || "",
        tags: "",
        source: "我的自定义词库"
      };
    }

    // 2. 内存热词缓存
    if (this.memoryCache.has(clean)) {
      const entry = this.memoryCache.get(clean);
      return {
        found: true,
        query: clean,
        lemma: clean,
        phonetic: entry.p || "",
        translation: entry.t || "",
        tags: entry.c || "",
        source: "本地英汉词库"
      };
    }

    // 3. 高频短语缓存
    if (this.commonPhrases && this.commonPhrases[clean]) {
      const pEntry = this.commonPhrases[clean];
      return {
        found: true,
        query: clean,
        lemma: clean,
        phonetic: pEntry.p || "",
        translation: pEntry.t || "",
        tags: pEntry.c || "",
        isPhrase: true,
        source: "固定短语与习惯用语"
      };
    }

    // 4. 内置基础词典 (如果有备用表)
    if (window.OFFLINE_DICTIONARY && window.OFFLINE_DICTIONARY[clean]) {
      const [ph, def] = window.OFFLINE_DICTIONARY[clean];
      return {
        found: true,
        query: clean,
        lemma: clean,
        phonetic: ph || "",
        translation: def || "",
        tags: "",
        source: "核心高频词库"
      };
    }

    return null;
  }

  /**
   * 异步深度查词 (首屏未命中时自动查询 IndexedDB 或拉取分片)
   */
  async lookupAsync(rawWord) {
    if (!rawWord) return null;
    const clean = rawWord.toLowerCase().trim().replace(/^[^a-zA-Z\s\-]+|[^a-zA-Z\s\-]+$/g, "");
    if (!clean) return null;

    // 1. 尝试同步查询
    const syncResult = this.lookupSync(clean);
    if (syncResult) return syncResult;

    // 2. 检查本地 IndexedDB 缓存
    if (window.localDB) {
      try {
        const cached = await window.localDB.getDictWord(clean);
        if (cached && cached.t) {
          this.memoryCache.set(clean, cached);
          return {
            found: true,
            query: clean,
            lemma: clean,
            phonetic: cached.p || "",
            translation: cached.t || "",
            tags: cached.c || "",
            source: "本地缓存词库"
          };
        }
      } catch (e) {}
    }

    // 3. 判断是否是短语
    const isPhrase = clean.includes(" ");
    const firstChar = clean[0];

    if (isPhrase) {
      if (firstChar >= "a" && firstChar <= "z") {
        await this.loadPhraseShard(firstChar);
        if (this.memoryCache.has(clean)) {
          const entry = this.memoryCache.get(clean);
          return {
            found: true,
            query: clean,
            lemma: clean,
            phonetic: entry.p || "",
            translation: entry.t || "",
            tags: entry.c || "",
            isPhrase: true,
            source: "离线短语词库"
          };
        }
      }
    } else {
      // 单词: 加载对应字母的分片
      if (firstChar >= "a" && firstChar <= "z") {
        await this.loadLetterShard(firstChar);
        if (this.memoryCache.has(clean)) {
          const entry = this.memoryCache.get(clean);
          return {
            found: true,
            query: clean,
            lemma: clean,
            phonetic: entry.p || "",
            translation: entry.t || "",
            tags: entry.c || "",
            source: "离线英汉词典"
          };
        }
      }
    }

    // 4. 词形还原与原型查询 (借助 lemmas.json)
    if (!isPhrase) {
      const lemmas = await this.loadLemmas();
      const baseWord = lemmas[clean];
      if (baseWord && baseWord !== clean) {
        const baseResult = await this.lookupAsync(baseWord);
        if (baseResult && baseResult.found) {
          return {
            found: true,
            query: clean,
            lemma: baseWord,
            phonetic: baseResult.phonetic || "",
            translation: baseResult.translation || "",
            tags: baseResult.tags || "",
            isStemmed: true,
            source: `词形还原 (${baseWord})`
          };
        }
      }

      // 规则推导备用 (stemmer.js)
      if (window.Stemmer && typeof window.Stemmer.getLemmaCandidates === "function") {
        const candidates = window.Stemmer.getLemmaCandidates(clean);
        for (const cand of candidates) {
          if (cand.form !== clean) {
            const candResult = await this.lookupAsync(cand.form);
            if (candResult && candResult.found) {
              return {
                found: true,
                query: clean,
                lemma: cand.form,
                phonetic: candResult.phonetic || "",
                translation: candResult.translation || "",
                tags: candResult.tags || "",
                isStemmed: true,
                rule: cand.rule,
                source: `词形推导 (${cand.form})`
              };
            }
          }
        }
      }
    }

    // 5. 未收录单词 (严格修复伪音标 Bug: 音标返回空字符串，不伪造 /word/)
    return {
      found: false,
      query: clean,
      lemma: clean,
      phonetic: "", // 真实空音标，杜绝伪音标
      translation: "暂未收录该词释义（点击下方「✏️ 记笔记」可直接添加个人释义）",
      tags: "",
      source: "未收录"
    };
  }

  /**
   * 兼容旧版同步调用接口
   */
  lookup(rawWord) {
    const res = this.lookupSync(rawWord);
    if (res) return res;

    const clean = (rawWord || "").toLowerCase().trim().replace(/^[^a-zA-Z\s\-]+|[^a-zA-Z\s\-]+$/g, "");
    return {
      found: false,
      query: clean,
      lemma: clean,
      phonetic: "", // 严格不输出伪音标
      translation: "正在检索完整离线词库...",
      tags: "",
      source: "检索中"
    };
  }

  getStats() {
    return {
      customCount: Object.keys(this.customDict).length,
      memoryCachedCount: this.memoryCache.size,
      totalLoadedShards: this.loadedShards.size
    };
  }
}

window.DictEngine = new DictEngineCore();
