/**
 * 文章阅读与交互引擎 (Article Reader & Tokenizer Engine) V2.0
 * 职责:
 * 1. 弯引号与缩写规范化、智能分句与语境保护
 * 2. 多词短语与固定搭配优先识别 (Greedy Phrase Matcher)
 * 3. 词形还原关联、点词查词异步加载与真实音标渲染
 * 4. 逐句高亮同步与沉浸式阅读卡片定位
 * 5. 可选考纲核心词汇高亮（默认关闭）
 */

class ArticleReader {
  constructor(containerElement, popoverElement) {
    this.container = containerElement;
    this.popover = popoverElement;
    this.backdrop = document.getElementById("popoverBackdrop");

    this.rawText = "";
    this.sentences = [];
    this.currentSentenceText = "";
    this.currentActiveWordEl = null;
    this.currentWordData = null;
    this.currentSentenceIdx = -1;

    this.autoSpeakOnClick = true;
    this.examHighlightEnabled = false;
    this.examHighlightType = "all";

    this.initPopoverEvents();
  }

  initPopoverEvents() {
    if (!this.popover) return;

    if (this.backdrop) {
      this.backdrop.addEventListener("click", () => this.hidePopover());
    }

    const btnSpeakUS = this.popover.querySelector("#popSpeakUS");
    if (btnSpeakUS) {
      btnSpeakUS.addEventListener("click", () => {
        if (this.currentWordData) {
          window.speechEngine.speakWordWithAccent(this.currentWordData.query, "us");
        }
      });
    }

    const btnSpeakUK = this.popover.querySelector("#popSpeakUK");
    if (btnSpeakUK) {
      btnSpeakUK.addEventListener("click", () => {
        if (this.currentWordData) {
          window.speechEngine.speakWordWithAccent(this.currentWordData.query, "uk");
        }
      });
    }

    const btnSpeakSentence = this.popover.querySelector("#popSpeakSentence");
    if (btnSpeakSentence) {
      btnSpeakSentence.addEventListener("click", () => {
        if (this.currentSentenceText) {
          window.speechEngine.speakSentence(this.currentSentenceText);
        }
      });
    }

    const btnToggleVocab = this.popover.querySelector("#popToggleVocab");
    if (btnToggleVocab) {
      btnToggleVocab.addEventListener("click", () => {
        if (!this.currentWordData) return;
        const w = this.currentWordData.query;
        if (window.vocabManager.hasWord(w)) {
          window.vocabManager.removeWord(w);
          this.updateVocabBtnState(false);
        } else {
          window.vocabManager.addWord(
            w,
            this.currentWordData.phonetic,
            this.currentWordData.translation,
            this.currentSentenceText
          );
          this.updateVocabBtnState(true);
        }
      });
    }

    const btnEditDef = this.popover.querySelector("#popEditDef");
    if (btnEditDef) {
      btnEditDef.addEventListener("click", () => {
        if (!this.currentWordData) return;
        if (window.app && typeof window.app.openEditDefModal === "function") {
          window.app.openEditDefModal(this.currentWordData.query, this.currentWordData.translation);
        }
      });
    }

    const btnClosePop = this.popover.querySelector("#popClose");
    if (btnClosePop) {
      btnClosePop.addEventListener("click", () => {
        this.hidePopover();
      });
    }
  }

  /**
   * 规范化英文引号与标点
   */
  normalizeText(text) {
    if (!text) return "";
    return text
      .replace(/[\u2018\u2019]/g, "'") // 弯单引号/撇号
      .replace(/[\u201C\u201D]/g, '"') // 弯双引号
      .replace(/[\u2013\u2014]/g, "--"); // 破折号
  }

  /**
   * 保护性英文分句
   */
  splitIntoSentences(text) {
    if (!text) return [];
    const normalized = this.normalizeText(text);

    let protectedText = normalized
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Gen|Rep|Sen|St|vs|e\.g|i\.e|etc|U\.S|U\.K|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec)\./gi, (match) => {
        return match.replace(/\./g, "___DOT___");
      })
      .replace(/(\d+)\.(\d+)/g, "$1___DOT___$2");

    const rawSentences = protectedText.split(/(?<=[.?!;])\s+/);
    const result = [];
    for (let s of rawSentences) {
      s = s.replace(/___DOT___/g, ".").trim();
      if (s) result.push(s);
    }
    return result;
  }

  /**
   * 加载并解析文章内容
   */
  loadArticle(text) {
    this.rawText = text || "";
    this.sentences = [];
    this.hidePopover();

    if (!this.rawText.trim()) {
      this.container.innerHTML = `
        <div class="empty-article-tip">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <p>请在上方输入框粘贴文章，或点击顶部“示例文档”开始点读！</p>
        </div>`;
      return;
    }

    const rawParagraphs = this.rawText.split(/\n+/);
    let globalSentenceIdx = 0;
    let html = "";

    const commonPhrases = (window.DictEngine && window.DictEngine.commonPhrases) ? window.DictEngine.commonPhrases : {};
    const customDict = (window.DictEngine && window.DictEngine.customDict) ? window.DictEngine.customDict : {};

    for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
      const pText = rawParagraphs[pIdx].trim();
      if (!pText) continue;

      const pSentences = this.splitIntoSentences(pText);
      let paragraphHtml = `<p class="reader-paragraph" data-paragraph-idx="${pIdx}">`;

      for (const sent of pSentences) {
        const currentSentIdx = globalSentenceIdx;
        this.sentences.push(sent);
        globalSentenceIdx++;

        paragraphHtml += `<span class="reader-sentence" data-sentence-idx="${currentSentIdx}">`;
        paragraphHtml += this.tokenizeSentenceWithPhrases(sent, currentSentIdx, commonPhrases, customDict);
        paragraphHtml += `</span> `;
      }

      paragraphHtml += `</p>`;
      html += paragraphHtml;
    }

    this.container.innerHTML = html;
    this.bindWordClickEvents();
    this._emitProgress(-1);
  }

  /**
   * 优先短语贪婪匹配分词
   */
  tokenizeSentenceWithPhrases(sentence, sentIdx, phrasesMap, customDict) {
    // 提取所有的词及标点令牌
    const regex = /([a-zA-Z]+(?:[-'][a-zA-Z]+)*)|([^a-zA-Z]+)/g;
    const tokens = [];
    let match;
    while ((match = regex.exec(sentence)) !== null) {
      if (match[1]) {
        tokens.push({ type: "word", text: match[1] });
      } else if (match[2]) {
        tokens.push({ type: "punct", text: match[2] });
      }
    }

    let outHtml = "";
    let i = 0;

    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === "punct") {
        outHtml += `<span class="reader-punct">${this.escapeHtml(t.text)}</span>`;
        i++;
        continue;
      }

      // 尝试贪婪匹配 4 词, 3 词, 2 词短语
      let phraseFound = false;
      for (let len = 4; len >= 2; len--) {
        const candidateWords = [];
        let curIdx = i;
        let valid = true;

        for (let k = 0; k < len; k++) {
          while (curIdx < tokens.length && tokens[curIdx].type === "punct" && /^[\s]+$/.test(tokens[curIdx].text)) {
            curIdx++;
          }
          if (curIdx < tokens.length && tokens[curIdx].type === "word") {
            candidateWords.push({ text: tokens[curIdx].text, tokenIdx: curIdx });
            curIdx++;
          } else {
            valid = false;
            break;
          }
        }

        if (valid && candidateWords.length === len) {
          const phraseStr = candidateWords.map(w => w.text.toLowerCase()).join(" ");
          if (phrasesMap[phraseStr] || customDict[phraseStr]) {
            // 匹配成功
            const displayPhrase = candidateWords.map(w => w.text).join(" ");
            outHtml += `<span class="reader-word reader-phrase" data-word="${this.escapeHtml(phraseStr)}" data-display="${this.escapeHtml(displayPhrase)}" data-sentence-idx="${sentIdx}" title="短语搭配">${this.escapeHtml(displayPhrase)}</span>`;
            i = curIdx;
            phraseFound = true;
            break;
          }
        }
      }

      if (!phraseFound) {
        // 单独单词
        const cleanLower = t.text.toLowerCase();
        let examClass = "";
        if (this.examHighlightEnabled && window.DictEngine) {
          const syncInfo = window.DictEngine.lookupSync(cleanLower);
          if (syncInfo && syncInfo.tags) {
            if (this.examHighlightType === "all" || syncInfo.tags.includes(this.examHighlightType)) {
              examClass = " exam-highlight";
            }
          }
        }

        outHtml += `<span class="reader-word${examClass}" data-word="${this.escapeHtml(t.text)}" data-sentence-idx="${sentIdx}">${this.escapeHtml(t.text)}</span>`;
        i++;
      }
    }

    return outHtml;
  }

  escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  bindWordClickEvents() {
    const wordElements = this.container.querySelectorAll(".reader-word");
    wordElements.forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleWordClick(el);
      });
    });
  }

  async handleWordClick(wordEl) {
    if (this.currentActiveWordEl) {
      this.currentActiveWordEl.classList.remove("word-active");
    }
    this.currentActiveWordEl = wordEl;
    wordEl.classList.add("word-active");

    const rawWord = wordEl.getAttribute("data-word");
    const sentenceIdx = parseInt(wordEl.getAttribute("data-sentence-idx"), 10);
    this.currentSentenceText = this.sentences[sentenceIdx] || "";
    this.currentSentenceIdx = sentenceIdx;
    this.highlightSentence(sentenceIdx, false);
    this._emitProgress(sentenceIdx);

    // 先展示即时卡片骨架
    const immediateData = window.DictEngine.lookupSync(rawWord) || {
      query: rawWord,
      phonetic: "",
      translation: "检索词库中...",
      source: "本地缓存"
    };
    this.currentWordData = immediateData;
    this.showPopover(wordEl, immediateData);

    // 异步加载完整释义
    const finalData = await window.DictEngine.lookupAsync(rawWord);
    if (finalData) {
      this.currentWordData = finalData;
      this.showPopover(wordEl, finalData);
    }

    // 点词发音
    if (this.autoSpeakOnClick && this.currentWordData) {
      window.speechEngine.speakWord(this.currentWordData.query);
    }
  }

  showPopover(targetEl, data) {
    if (!this.popover) return;

    const wordTitle = this.popover.querySelector("#popWordTitle");
    const lemmaTag = this.popover.querySelector("#popLemmaTag");
    const phonetic = this.popover.querySelector("#popPhonetic");
    const translation = this.popover.querySelector("#popTranslation");
    const sourceTag = this.popover.querySelector("#popSourceTag");

    if (wordTitle) wordTitle.textContent = data.query;
    if (phonetic) {
      phonetic.textContent = data.phonetic ? `/${data.phonetic}/` : "";
      phonetic.style.display = data.phonetic ? "inline" : "none";
    }
    if (translation) translation.textContent = data.translation || "暂无释义";

    if (lemmaTag) {
      if (data.isStemmed && data.lemma && data.lemma !== data.query) {
        lemmaTag.textContent = `原型: ${data.lemma}`;
        lemmaTag.style.display = "inline-block";
      } else {
        lemmaTag.style.display = "none";
      }
    }

    if (sourceTag) {
      sourceTag.textContent = data.source || "本地词典";
    }

    this.updateVocabBtnState(window.vocabManager.hasWord(data.query));

    // 计算定位
    this.positionPopover(targetEl);
    this.popover.classList.remove("hidden");
    this.popover.style.display = "block";
    if (this.backdrop) this.backdrop.classList.remove("hidden");
  }

  positionPopover(targetEl) {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      this.popover.style.left = "50%";
      this.popover.style.top = "50%";
      this.popover.style.transform = "translate(-50%, -50%)";
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const popWidth = 320;
    const popHeight = 220;

    let left = rect.left + rect.width / 2 - popWidth / 2;
    let top = rect.bottom + 8;

    if (left + popWidth > window.innerWidth - 12) {
      left = window.innerWidth - popWidth - 12;
    }
    if (left < 12) left = 12;

    if (top + popHeight > window.innerHeight - 12) {
      top = rect.top - popHeight - 8;
    }

    this.popover.style.transform = "none";
    this.popover.style.left = `${Math.round(left)}px`;
    this.popover.style.top = `${Math.round(top)}px`;
  }

  hidePopover() {
    if (this.popover) {
      this.popover.classList.add("hidden");
      this.popover.style.display = "none";
    }
    if (this.backdrop) this.backdrop.classList.add("hidden");
    if (this.currentActiveWordEl) {
      this.currentActiveWordEl.classList.remove("word-active");
      this.currentActiveWordEl = null;
    }
  }

  updateVocabBtnState(isSaved) {
    const btn = this.popover ? this.popover.querySelector("#popToggleVocab") : null;
    if (!btn) return;
    if (isSaved) {
      btn.innerHTML = `<span>★</span> 已存生词`;
      btn.classList.add("primary");
    } else {
      btn.innerHTML = `<span>☆</span> 存入生词本`;
      btn.classList.remove("primary");
    }
  }

  highlightSentence(index, autoScroll = true) {
    this.clearSentenceHighlight();
    this.currentSentenceIdx = index;
    this._emitProgress(index);
    const sentEl = this.container.querySelector(`.reader-sentence[data-sentence-idx="${index}"]`);
    if (sentEl) {
      sentEl.classList.add("sentence-highlight");
      sentEl.classList.add("sentence-active");
      if (autoScroll) {
        sentEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  _emitProgress(idx) {
    window.dispatchEvent(new CustomEvent("readerProgressChanged", {
      detail: {
        sentenceIdx: idx,
        totalSentences: this.sentences.length
      }
    }));
  }

  clearSentenceHighlight() {
    const prev = this.container.querySelectorAll(".sentence-highlight, .sentence-active");
    prev.forEach(el => {
      el.classList.remove("sentence-highlight");
      el.classList.remove("sentence-active");
    });
  }

  highlightWordAtCharIndex(sentenceIdx, charIndex) {
    const sentEl = this.container.querySelector(`.reader-sentence[data-sentence-idx="${sentenceIdx}"]`);
    if (!sentEl) return;
    const wordEls = sentEl.querySelectorAll(".reader-word");
    if (!wordEls || wordEls.length === 0) return;

    const sentText = this.sentences[sentenceIdx] || "";
    let curSearchPos = 0;

    for (let i = 0; i < wordEls.length; i++) {
      const wEl = wordEls[i];
      const wordText = wEl.getAttribute("data-word") || wEl.textContent.trim();
      const pos = sentText.indexOf(wordText, curSearchPos);
      if (pos !== -1) {
        curSearchPos = pos + wordText.length;
        if (charIndex >= pos && charIndex <= curSearchPos) {
          if (this.currentActiveWordEl && this.currentActiveWordEl !== wEl) {
            this.currentActiveWordEl.classList.remove("word-active");
          }
          this.currentActiveWordEl = wEl;
          wEl.classList.add("word-active");
          break;
        }
      }
    }
  }

  clearWordHighlight() {
    if (this.currentActiveWordEl) {
      this.currentActiveWordEl.classList.remove("word-active");
      this.currentActiveWordEl = null;
    }
    const actives = this.container.querySelectorAll(".word-active");
    actives.forEach(el => el.classList.remove("word-active"));
  }

  getSentenceList() {
    return this.sentences;
  }
}

window.ArticleReader = ArticleReader;
