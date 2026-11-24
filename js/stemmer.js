/**
 * 英语词形还原与曲折变化分析器 (Stemmer & Lemmatizer)
 * 100% 离线运行，无需任何 API
 * 自动识别复数、过去式、进行时、比较级、最高级及不规则变形
 */

// 常见不规则变形映射表（过去式、过去分词、复数、比较级等）
const IRREGULAR_FORMS = {
  // 不规则动词
  "am": "be", "is": "be", "are": "be", "was": "be", "were": "be", "been": "be", "being": "be",
  "has": "have", "had": "have", "having": "have",
  "does": "do", "did": "do", "done": "do", "doing": "do",
  "says": "say", "said": "say", "saying": "say",
  "goes": "go", "went": "go", "gone": "go", "going": "go",
  "gets": "get", "got": "get", "gotten": "get", "getting": "get",
  "makes": "make", "made": "make", "making": "make",
  "knows": "know", "knew": "know", "known": "know",
  "thinks": "think", "thought": "think",
  "takes": "take", "took": "take", "taken": "take", "taking": "take",
  "sees": "see", "saw": "see", "seen": "see", "seeing": "see",
  "comes": "come", "came": "come", "coming": "come",
  "finds": "find", "found": "find",
  "gives": "give", "gave": "give", "given": "give", "giving": "give",
  "tells": "tell", "told": "tell",
  "feels": "feel", "felt": "feel",
  "becomes": "become", "became": "become",
  "leaves": "leave", "left": "leave", "leaving": "leave",
  "puts": "put", "putting": "put",
  "means": "mean", "meant": "mean",
  "keeps": "keep", "kept": "keep",
  "lets": "let", "letting": "let",
  "begins": "begin", "began": "begin", "begun": "begin", "beginning": "begin",
  "shows": "show", "showed": "show", "shown": "show",
  "hears": "hear", "heard": "hear",
  "runs": "run", "ran": "run", "running": "run",
  "brings": "bring", "brought": "bring",
  "writes": "write", "wrote": "write", "written": "write", "writing": "write",
  "sits": "sit", "sat": "sit", "sitting": "sit",
  "stands": "stand", "stood": "stand",
  "loses": "lose", "lost": "lose", "losing": "lose",
  "pays": "pay", "paid": "pay",
  "meets": "meet", "met": "meet",
  "includes": "include", "included": "include",
  "continues": "continue", "continued": "continue",
  "sets": "set", "setting": "set",
  "learns": "learn", "learnt": "learn", "learned": "learn",
  "changes": "change", "changed": "change",
  "leads": "lead", "led": "lead",
  "understands": "understand", "understood": "understand",
  "watches": "watch", "watched": "watch",
  "follows": "follow", "followed": "follow",
  "stops": "stop", "stopped": "stop", "stopping": "stop",
  "creates": "create", "created": "create",
  "speaks": "speak", "spoke": "speak", "spoken": "speak",
  "reads": "read",
  "spends": "spend", "spent": "spend",
  "grows": "grow", "grew": "grow", "grown": "grow",
  "wins": "win", "won": "win", "winning": "win",
  "teaches": "teach", "taught": "teach",
  "buys": "buy", "bought": "buy",
  "sends": "send", "sent": "send",
  "builds": "build", "built": "build",
  "falls": "fall", "fell": "fall", "fallen": "fall",
  "cuts": "cut", "cutting": "cut",
  "sells": "sell", "sold": "sell",
  "drives": "drive", "drove": "drive", "driven": "drive", "driving": "drive",
  "breaks": "break", "broke": "break", "broken": "break",
  "hits": "hit", "hitting": "hit",
  "eats": "eat", "ate": "eat", "eaten": "eat", "eating": "eat",
  "catches": "catch", "caught": "catch",
  "draws": "draw", "drew": "draw", "drawn": "draw",
  "chooses": "choose", "chose": "choose", "chosen": "choose", "choosing": "choose",
  "fights": "fight", "fought": "fight",
  "throws": "throw", "threw": "throw", "thrown": "throw",
  "flies": "fly", "flew": "fly", "flown": "fly", "flying": "fly",
  "lies": "lie", "lay": "lie", "lain": "lie", "lying": "lie",
  "lays": "lay", "laid": "lay",
  "swims": "swim", "swam": "swim", "swum": "swim", "swimming": "swim",
  "sings": "sing", "sang": "sing", "sung": "sing",
  "drinks": "drink", "drank": "drink", "drunk": "drink",
  "sleeps": "sleep", "slept": "sleep",
  "wears": "wear", "wore": "wear", "worn": "wear",
  "rides": "ride", "rode": "ride", "ridden": "ride", "riding": "ride",
  "rises": "rise", "rose": "rise", "risen": "rise", "rising": "rise",
  "forgets": "forget", "forgot": "forget", "forgotten": "forget", "forgetting": "forget",
  "hides": "hide", "hid": "hide", "hidden": "hide", "hiding": "hide",
  "bites": "bite", "bit": "bite", "bitten": "bite",
  "blows": "blow", "blew": "blow", "blown": "blow",
  "burns": "burn", "burnt": "burn", "burned": "burn",
  "dreams": "dream", "dreamt": "dream", "dreamed": "dream",
  "hangs": "hang", "hung": "hang",
  "hurts": "hurt",
  "shoots": "shoot", "shot": "shoot",
  "shuts": "shut", "shutting": "shut",
  "steals": "steal", "stole": "steal", "stolen": "steal",
  "tears": "tear", "tore": "tear", "torn": "tear",
  "wakes": "wake", "woke": "wake", "woken": "wake",
  "rings": "ring", "rang": "ring", "rung": "ring",
  "freezes": "freeze", "froze": "freeze", "frozen": "freeze",

  // 不规则名词复数
  "men": "man", "women": "woman", "children": "child", "people": "person",
  "teeth": "tooth", "feet": "foot", "mice": "mouse", "geese": "goose",
  "oxen": "ox", "criteria": "criterion", "phenomena": "phenomenon",
  "analyses": "analysis", "bases": "basis", "crises": "crisis",
  "data": "datum", "media": "medium",

  // 不规则形容词/副词比较级与最高级
  "better": "good", "best": "good",
  "worse": "bad", "worst": "bad",
  "more": "many", "most": "many",
  "less": "little", "least": "little",
  "further": "far", "furthest": "far", "farther": "far", "farthest": "far",
  "older": "old", "oldest": "old", "elder": "old", "eldest": "old"
};

/**
 * 词形还原候选生成器
 * 给定一个单词（例如 "running", "happier", "cities", "believed"）
 * 返回所有可能的原形候选列表（按优先级排序）
 */
function getLemmaCandidates(word) {
  const w = word.toLowerCase().trim();
  const candidates = [];

  // 1. 不规则变形匹配
  if (IRREGULAR_FORMS[w]) {
    candidates.push({ form: IRREGULAR_FORMS[w], rule: "不规则变形" });
  }

  // 2. 动名词/进行时 -ing
  if (w.endsWith("ing") && w.length > 4) {
    const base = w.slice(0, -3);
    // 重叠辅音字母双写: running -> run, swimming -> swim, stopping -> stop
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      candidates.push({ form: base.slice(0, -1), rule: "进行时 (去双写辅音)" });
    }
    // 去 e 加 ing: making -> make, writing -> write
    candidates.push({ form: base + "e", rule: "现在分词 (原形加e)" });
    // 直接加 ing: doing -> do, playing -> play
    candidates.push({ form: base, rule: "现在分词" });
    // y 变 ie + ing: lying -> lie, dying -> die, tying -> tie
    if (base.endsWith("y")) {
      candidates.push({ form: base.slice(0, -1) + "ie", rule: "现在分词 (y变ie)" });
    }
  }

  // 3. 过去式/过去分词 -ed
  if (w.endsWith("ed") && w.length > 3) {
    if (w.endsWith("ied") && w.length > 4) {
      // 辅音+y 变 ied: studied -> study, carried -> carry
      candidates.push({ form: w.slice(0, -3) + "y", rule: "过去式 (y变ied)" });
    }
    const base = w.slice(0, -2);
    // 双写辅音: stopped -> stop, planned -> plan
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      candidates.push({ form: base.slice(0, -1), rule: "过去式 (去双写辅音)" });
    }
    // 原形以 e 结尾: loved -> love, liked -> like
    candidates.push({ form: base + "e", rule: "过去式 (原形加e)" });
    // 直接加 ed: walked -> walk, played -> play
    candidates.push({ form: base, rule: "过去式" });
  }

  // 4. 复数/单三 -s, -es, -ies, -ves
  if (w.endsWith("ies") && w.length > 4) {
    // cities -> city, baby -> babies
    candidates.push({ form: w.slice(0, -3) + "y", rule: "复数/单三 (y变ies)" });
  }
  if (w.endsWith("ves") && w.length > 4) {
    // lives -> life/live, wolves -> wolf, knives -> knife
    candidates.push({ form: w.slice(0, -3) + "fe", rule: "复数 (fe变ves)" });
    candidates.push({ form: w.slice(0, -3) + "f", rule: "复数 (f变ves)" });
  }
  if (w.endsWith("es") && w.length > 3) {
    // watches -> watch, boxes -> box, kisses -> kiss
    candidates.push({ form: w.slice(0, -2), rule: "复数/单三 (加es)" });
    // closes -> close
    candidates.push({ form: w.slice(0, -1), rule: "单三 (加s)" });
  }
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 2) {
    // cats -> cat, books -> book
    candidates.push({ form: w.slice(0, -1), rule: "复数/单三" });
  }

  // 5. 比较级/最高级 -er, -est
  if (w.endsWith("est") && w.length > 4) {
    if (w.endsWith("iest")) {
      candidates.push({ form: w.slice(0, -4) + "y", rule: "最高级 (y变iest)" });
    }
    const base = w.slice(0, -3);
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      candidates.push({ form: base.slice(0, -1), rule: "最高级 (双写辅音)" });
    }
    candidates.push({ form: base + "e", rule: "最高级 (加st)" });
    candidates.push({ form: base, rule: "最高级" });
  }
  if (w.endsWith("er") && w.length > 3) {
    if (w.endsWith("ier")) {
      candidates.push({ form: w.slice(0, -3) + "y", rule: "比较级 (y变ier)" });
    }
    const base = w.slice(0, -2);
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      candidates.push({ form: base.slice(0, -1), rule: "比较级 (双写辅音)" });
    }
    candidates.push({ form: base + "e", rule: "比较级 (加r)" });
    candidates.push({ form: base, rule: "比较级" });
  }

  // 6. 副词 -ly
  if (w.endsWith("ly") && w.length > 4) {
    if (w.endsWith("ily")) {
      candidates.push({ form: w.slice(0, -3) + "y", rule: "副词 (y变ily)" });
    }
    candidates.push({ form: w.slice(0, -2), rule: "副词 (去ly)" });
  }

  return candidates;
}

// 导出全局对象
window.Stemmer = {
  IRREGULAR_FORMS,
  getLemmaCandidates
};
