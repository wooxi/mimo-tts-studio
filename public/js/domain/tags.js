/**
 * Tag catalogue.
 *
 * Two families, and the distinction matters because they go in different
 * places in the request:
 *
 *   整体风格标签   written once at the very start of the spoken text,
 *                  e.g. `(怅然)这么多年过去了…`
 *   句内音频标签   inserted anywhere in the spoken text,
 *                  e.g. `（紧张，深呼吸）呼……冷静`
 *
 * Both live in the `assistant` message — unlike natural-language direction,
 * which goes in the `user` message. The script editor highlights the two
 * families in different colours for exactly that reason.
 *
 * The model accepts unlisted tags too, so these are starting points, not an
 * allow-list.
 */

export const STYLE_GROUPS = [
  {
    id: "mood-basic",
    label: "基础情绪",
    tags: ["开心", "悲伤", "愤怒", "恐惧", "惊讶", "兴奋", "委屈", "平静", "冷漠"],
  },
  {
    id: "mood-complex",
    label: "复合情绪",
    tags: ["怅然", "欣慰", "无奈", "愧疚", "释然", "嫉妒", "厌倦", "忐忑", "动情"],
  },
  {
    id: "tone",
    label: "整体语调",
    tags: ["温柔", "高冷", "活泼", "严肃", "慵懒", "俏皮", "深沉", "干练", "凌厉"],
  },
  {
    id: "timbre",
    label: "音色定位",
    tags: ["磁性", "醇厚", "清亮", "空灵", "稚嫩", "苍老", "甜美", "沙哑", "醇雅"],
  },
  {
    id: "persona",
    label: "人设腔调",
    tags: ["夹子音", "御姐音", "正太音", "大叔音", "台湾腔"],
  },
  {
    id: "dialect",
    label: "方言",
    tags: ["东北话", "四川话", "河南话", "粤语"],
  },
  {
    id: "roleplay",
    label: "角色扮演",
    tags: ["孙悟空", "林黛玉"],
    note: "改变说话风格，不改变基础嗓音。",
  },
];

export const STYLE_GROUPS_EN = [
  {
    id: "mood-basic",
    label: "Emotion",
    tags: ["happy", "sad", "angry", "fearful", "amazed", "excited", "wronged", "calm", "indifferent"],
  },
  {
    id: "mood-complex",
    label: "Complex",
    tags: ["wistful", "relieved", "helpless", "guilty", "jealous", "weary", "apprehensive", "moved"],
  },
  {
    id: "tone",
    label: "Tone",
    tags: ["gentle", "cold", "lively", "serious", "lazy", "playful", "deep", "crisp", "sharp"],
  },
  {
    id: "timbre",
    label: "Timbre",
    tags: ["magnetic", "mellow", "clear", "ethereal", "youthful", "aged", "sweet", "husky", "elegant"],
  },
  {
    id: "dialect",
    label: "Accent",
    tags: ["British accent", "American accent", "Indian accent", "Southern drawl"],
  },
];

export const INLINE_GROUPS_ZH = [
  {
    id: "pace",
    label: "语速节奏",
    tags: ["吸气", "深呼吸", "叹气", "长叹一口气", "喘息", "屏息", "语速加快", "语速放慢", "停顿", "长停顿"],
  },
  {
    id: "state",
    label: "情绪状态",
    tags: ["紧张", "害怕", "激动", "疲惫", "委屈", "撒娇", "心虚", "震惊", "不耐烦", "碎碎念"],
  },
  {
    id: "voice",
    label: "语音特征",
    tags: ["颤抖", "声音颤抖", "变调", "破音", "鼻音", "气声", "沙哑", "小声", "提高音量喊话"],
  },
  {
    id: "cry",
    label: "哭笑表达",
    tags: ["笑", "轻笑", "大笑", "冷笑", "苦笑", "抽泣", "呜咽", "哽咽", "嚎啕大哭"],
  },
];

export const INLINE_GROUPS_EN = [
  {
    id: "pace",
    label: "Pacing",
    tags: ["inhale", "sighs", "long sigh", "panting", "pause", "long pause", "fast", "slow", "drawn out"],
  },
  {
    id: "state",
    label: "Emotion",
    tags: ["nervous", "scared", "excited", "tired", "wronged", "shocked", "impatient", "whispering"],
  },
  {
    id: "voice",
    label: "Voice",
    tags: ["trembling", "cracked voice", "nasal", "breathy", "hoarse", "emphasis"],
  },
  {
    id: "cry",
    label: "Laugh / cry",
    tags: ["laughs", "chuckle", "hearty laugh", "sneer", "sob", "whimper", "choked up", "wail"],
  },
];

/** Singing is its own tag because position — the very start — is mandatory. */
export const SINGING_TAG = "唱歌";

export const BRACKETS = {
  zh: { open: "（", close: "）" },
  en: { open: "(", close: ")" },
  square: { open: "[", close: "]" },
};

/** Pick the tag language that matches the script, per the official guidance. */
export function scriptLang(text) {
  const sample = String(text || "").slice(0, 400);
  if (!sample) return "zh";
  let cjk = 0;
  for (const ch of sample) if (/[\u3400-\u9fff]/.test(ch)) cjk++;
  return cjk / sample.length >= 0.15 ? "zh" : "en";
}

export function inlineGroupsFor(text) {
  return scriptLang(text) === "en" ? INLINE_GROUPS_EN : INLINE_GROUPS_ZH;
}

/**
 * Style vocabulary follows the script's language, per the official guidance
 * that tags should be written in the same language as the spoken text.
 */
export function styleGroupsFor(text) {
  return scriptLang(text) === "en" ? STYLE_GROUPS_EN : STYLE_GROUPS;
}

/**
 * Wrap a tag for inline use. Chinese uses full-width brackets so it never
 * collides with half-width punctuation in Latin text.
 */
export function inlineWrap(tag, text) {
  return scriptLang(text) === "en" ? `(${tag})` : `（${tag}）`;
}

/* ------------------------------------------------------------ tag scanning -- */

/**
 * Find every bracketed group in the script and classify it.
 *
 * A group at index 0 is the overall style tag; everything else is an inline
 * audio tag. `(唱歌)` leads the style group but keeps its own colour, since
 * getting its position wrong is the one tag mistake the model will not fix.
 */
export function scanScript(text) {
  const src = String(text || "");
  const out = [];
  const re = /[(（[\[][^)）\]]{1,40}[)）\]]/g;
  let m;

  while ((m = re.exec(src))) {
    const raw = m[0];
    const inner = raw.slice(1, -1).trim();
    const isStyle = m.index === 0;
    let kind = isStyle ? "style" : "inline";
    if (/^(唱歌|sing|singing)$/i.test(inner)) kind = "sing";
    out.push({ start: m.index, end: m.index + raw.length, raw, inner, kind });
  }
  return out;
}

/**
 * The tags in the leading group.
 *
 * Only a group at index 0 counts. Testing `kind` alone was not enough: an
 * inline tag mid-sentence is typed `inline`, but the sheet would still read it
 * back as the overall style and merge it into a new leading group.
 */
export function leadingStyleTags(text) {
  const tags = scanScript(text);
  const first = tags[0];
  if (!first || first.start !== 0) return [];
  if (first.kind === "sing") {
    // `(唱歌 温柔)` — the group is leading, the singing flag is one member.
    return first.inner
      .split(/[\s,，、|｜/]+/)
      .map((s) => s.trim())
      .filter((s) => s && !/^(唱歌|sing|singing)$/i.test(s));
  }
  return first.inner
    .split(/[\s,，、|｜/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whether the script asks for singing, regardless of where the tag sits. */
export function isSinging(text) {
  return scanScript(text).some((t) => t.kind === "sing");
}

/* ------------------------------------------------- leading-group editing -- */

const LEAD_RE = /^\s*[(（[\[［【][^)）\]\]］】]*[)）\]］】]/;

/**
 * Rewrite the leading `(… )` group and return the whole script.
 *
 * This is the single implementation of "change the overall style", used by the
 * tag sheet, the chips and the singing toggle. Keeping it here rather than in
 * the views is what stops the three of them drifting apart.
 */
export function setLeadingTags(text, tags, { singing = false } = {}) {
  const src = String(text || "");
  const lead = src.match(LEAD_RE);
  const body = (lead ? src.slice(lead[0].length) : src).replace(/^\s+/, "");

  const all = [singing ? SINGING_TAG : null, ...tags].filter(Boolean);
  if (!all.length) return body;
  return `(${all.join(" ")})${body}`;
}

export function toggleLeadingTag(text, tag) {
  const tags = leadingStyleTags(text);
  const next = tags.includes(tag)
    ? tags.filter((t) => t !== tag)
    : [...tags, tag];
  return setLeadingTags(text, next, { singing: isSinging(text) });
}

export function removeLeadingTag(text, tag) {
  return setLeadingTags(
    text,
    leadingStyleTags(text).filter((t) => t !== tag),
    { singing: isSinging(text) },
  );
}

export function toggleSinging(text) {
  return setLeadingTags(text, leadingStyleTags(text), {
    singing: !isSinging(text),
  });
}
