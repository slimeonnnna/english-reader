/**
 * 文章分词渲染与点读交互引擎 (Article Reader & Tokenizer Engine)
 * 负责英文文本段落重组、智能分句、逐词标记、点击浮动弹窗与发音同步
 */

class ArticleReader {
  constructor(containerElement, popoverElement) {
    this.container = containerElement;
    this.popover = popoverElement;
    this.rawText = "";
    this.sentences = []; // 存储所有句子纯文本
    this.currentActiveWordEl = null;
    this.currentActiveSentenceIdx = -1;
    this.autoSpeakOnClick = true; // 默认点击单词立即发音

    this.initPopover();
  }

  setAutoSpeak(enable) {
    this.autoSpeakOnClick = !!enable;
    try {
      localStorage.setItem("english_reader_auto_speak", this.autoSpeakOnClick ? "1" : "0");
    } catch (e) {}
  }

  initPopover() {
    // 点击页面其他空白处关闭弹窗
    document.addEventListener("click", (e) => {
      if (!this.popover) return;
      if (this.popover.contains(e.target)) return;
      if (e.target.classList && e.target.classList.contains("reader-word")) return;
      this.hidePopover();
    });

    // 绑定弹窗内按钮事件
    const btnSpeakWord = this.popover.querySelector("#popSpeakWord");
    if (btnSpeakWord) {
      btnSpeakWord.addEventListener("click", () => {
        if (this.currentWordData) {
          window.speechEngine.speakWord(this.currentWordData.query);
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
        window.app.openEditDefModal(this.currentWordData.query, this.currentWordData.translation);
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
   * 智能分句算法
   * 避免对 Mr. / Mrs. / Dr. / U.S. / e.g. / i.e. / 数字小数点 进行误截断
   */
  splitIntoSentences(text) {
    if (!text) return [];
    
    // 保护常见缩写
    let protectedText = text
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Gen|Rep|Sen|St|vs|e\.g|i\.e|etc|U\.S|U\.K)\./gi, (match) => {
        return match.replace(/\./g, "___DOT___");
      })
      .replace(/(\d+)\.(\d+)/g, "$1___DOT___$2"); // 保护小数

    // 按句号、问号、叹号或分号分割
    const rawSentences = protectedText.split(/(?<=[.?!;])\s+/);
    const result = [];

    for (let s of rawSentences) {
      s = s.replace(/___DOT___/g, ".").trim();
      if (s) {
        result.push(s);
      }
    }

    return result;
  }

  /**
   * 加载并渲染文章
   * @param {string} text - 英文文章原文
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

    // 按段落切分
    const rawParagraphs = this.rawText.split(/\n+/);
    let globalSentenceIdx = 0;
    let html = "";

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
        
        // 将句子拆分为单词与非单词符号
        // 匹配英文字符串（含单引号缩写如 don't, it's）
        const tokens = sent.split(/([a-zA-Z]+(?:'[a-zA-Z]+)?)/g);
        let wordIdx = 0;

        for (const token of tokens) {
          if (!token) continue;
          if (/^[a-zA-Z]+(?:'[a-zA-Z]+)?$/.test(token)) {
            // 是单词
            paragraphHtml += `<span class="reader-word" data-word="${token}" data-sentence-idx="${currentSentIdx}" data-word-idx="${wordIdx}">${token}</span>`;
            wordIdx++;
          } else {
            // 是标点或空格
            paragraphHtml += `<span class="reader-punct">${this.escapeHtml(token)}</span>`;
          }
        }

        paragraphHtml += `</span> `;
      }

      paragraphHtml += `</p>`;
      html += paragraphHtml;
    }

    this.container.innerHTML = html;
    this.bindWordClickEvents();
  }

  escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  handleWordClick(wordEl) {
    // 移除之前的单词高亮
    if (this.currentActiveWordEl) {
      this.currentActiveWordEl.classList.remove("word-active");
    }
    this.currentActiveWordEl = wordEl;
    wordEl.classList.add("word-active");

    const rawWord = wordEl.getAttribute("data-word");
    const sentenceIdx = parseInt(wordEl.getAttribute("data-sentence-idx"), 10);
    this.currentSentenceText = this.sentences[sentenceIdx] || "";

    // 调用离线词典查询
    const dictResult = window.DictEngine.lookup(rawWord);
    this.currentWordData = dictResult;

    // 显示浮动卡片
    this.showPopover(wordEl, dictResult);

    // 点词即发音 (如果开启了该设置)
    if (this.autoSpeakOnClick) {
      window.speechEngine.speakWord(dictResult.query);
    }
  }

  showPopover(targetEl, data) {
    if (!this.popover) return;

    // 填充卡片数据
    const wordTitle = this.popover.querySelector("#popWordTitle");
    const lemmaTag = this.popover.querySelector("#popLemmaTag");
    const phonetic = this.popover.querySelector("#popPhonetic");
    const translation = this.popover.querySelector("#popTranslation");
    const sourceTag = this.popover.querySelector("#popSourceTag");

    if (wordTitle) wordTitle.textContent = data.query;
    if (phonetic) phonetic.textContent = data.phonetic || "";
    if (translation) translation.textContent = data.translation || "暂无释义";

    if (lemmaTag) {
      if (data.isStemmed && data.lemma !== data.query) {
        lemmaTag.textContent = `原形: ${data.lemma} (${data.rule || "曲折变形"})`;
        lemmaTag.style.display = "inline-block";
      } else {
        lemmaTag.style.display = "none";
      }
    }

    if (sourceTag) {
      sourceTag.textContent = data.source || "";
    }

    // 更新生词本按钮状态
    const inVocab = window.vocabManager.hasWord(data.query);
    this.updateVocabBtnState(inVocab);

    // 计算弹窗绝对坐标（防止越出屏幕右侧或顶部）
    this.popover.classList.remove("hidden");
    this.popover.style.display = "block";

    const rect = targetEl.getBoundingClientRect();
    const popRect = this.popover.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    // 默认在单词上方居中显示
    let left = rect.left + scrollX + (rect.width / 2) - (popRect.width / 2);
    let top = rect.top + scrollY - popRect.height - 10;

    // 边界检测：防止超出右边界
    const maxLeft = window.innerWidth - popRect.width - 15;
    if (left > maxLeft) left = maxLeft;
    if (left < 15) left = 15;

    // 边界检测：若上方空间不足，则在下方显示
    if (rect.top - popRect.height < 10) {
      top = rect.bottom + scrollY + 10;
    }

    this.popover.style.left = `${Math.round(left)}px`;
    this.popover.style.top = `${Math.round(top)}px`;
  }

  updateVocabBtnState(isSaved) {
    const btn = this.popover.querySelector("#popToggleVocab");
    if (!btn) return;
    if (isSaved) {
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
        <span>已收藏</span>
      `;
      btn.classList.add("saved");
    } else {
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
        <span>加入生词本</span>
      `;
      btn.classList.remove("saved");
    }
  }

  hidePopover() {
    if (this.popover) {
      this.popover.style.display = "none";
      this.popover.classList.add("hidden");
    }
    if (this.currentActiveWordEl) {
      this.currentActiveWordEl.classList.remove("word-active");
      this.currentActiveWordEl = null;
    }
  }

  /**
   * 句子朗读高亮跟踪
   */
  highlightSentence(sentenceIdx) {
    // 移除上一个句子的激活样式
    if (this.currentActiveSentenceIdx >= 0) {
      const prevEl = this.container.querySelector(`.reader-sentence[data-sentence-idx="${this.currentActiveSentenceIdx}"]`);
      if (prevEl) prevEl.classList.remove("sentence-active");
    }

    this.currentActiveSentenceIdx = sentenceIdx;
    const currentEl = this.container.querySelector(`.reader-sentence[data-sentence-idx="${sentenceIdx}"]`);
    if (currentEl) {
      currentEl.classList.add("sentence-active");
      // 保持当前句子平滑滚动在可视区
      currentEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  clearSentenceHighlight() {
    if (this.currentActiveSentenceIdx >= 0) {
      const prevEl = this.container.querySelector(`.reader-sentence[data-sentence-idx="${this.currentActiveSentenceIdx}"]`);
      if (prevEl) prevEl.classList.remove("sentence-active");
      this.currentActiveSentenceIdx = -1;
    }
  }

  getSentenceList() {
    return this.sentences;
  }
}

window.ArticleReader = ArticleReader;
