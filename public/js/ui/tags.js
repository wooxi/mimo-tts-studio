/** 标签系统：分组 tab + 搜索 + 选中 chip */

export const STYLE_TAGS = [
  "开心",
  "悲伤",
  "愤怒",
  "恐惧",
  "惊讶",
  "兴奋",
  "委屈",
  "平静",
  "冷漠",
  "怅然",
  "欣慰",
  "无奈",
  "愧疚",
  "释然",
  "嫉妒",
  "厌倦",
  "忐忑",
  "动情",
  "温柔",
  "高冷",
  "活泼",
  "严肃",
  "慵懒",
  "俏皮",
  "深沉",
  "干练",
  "凌厉",
  "磁性",
  "醇厚",
  "清亮",
  "空灵",
  "稚嫩",
  "苍老",
  "甜美",
  "沙哑",
  "醇雅",
];

export const ACCENT_TAGS = [
  "夹子音",
  "御姐音",
  "正太音",
  "大叔音",
  "台湾腔",
  "东北话",
  "四川话",
  "河南话",
  "粤语",
];

export const ROLE_TAGS = ["孙悟空", "林黛玉"];

export const AUDIO_TAGS = [
  "吸气",
  "深呼吸",
  "叹气",
  "长叹一口气",
  "喘息",
  "屏息",
  "紧张",
  "害怕",
  "激动",
  "疲惫",
  "委屈",
  "撒娇",
  "心虚",
  "震惊",
  "不耐烦",
  "颤抖",
  "声音颤抖",
  "变调",
  "破音",
  "鼻音",
  "气声",
  "沙哑",
  "笑",
  "轻笑",
  "大笑",
  "冷笑",
  "抽泣",
  "呜咽",
  "哽咽",
  "嚎啕大哭",
  "沉默片刻",
  "小声",
  "提高音量喊话",
  "语速加快",
  "语速放慢",
  "碎碎念",
];

export const TAG_GROUPS = [
  { id: "style", label: "风格", tags: STYLE_TAGS, kind: "style" },
  { id: "accent", label: "口音·方言", tags: ACCENT_TAGS, kind: "style" },
  { id: "role", label: "角色", tags: ROLE_TAGS, kind: "style" },
  { id: "audio", label: "音效", tags: AUDIO_TAGS, kind: "audio" },
];

/**
 * 渲染标签面板。
 * @param {HTMLElement} root
 * @param {{styleTags:Set<string>, onStyleTag(t:string,on:boolean):void, onAudioTag(t:string):void, refreshChips():void}} handlers
 */
export function initTags(root, state, handlers) {
  const head = document.createElement("div");
  head.className = "tags-head";
  head.innerHTML = `
    <div class="segmented" data-role="group-tabs"></div>
    <input type="search" placeholder="搜索标签…" aria-label="搜索标签">
  `;
  const body = document.createElement("div");
  body.className = "tags-body";
  root.append(head, body);

  const tabs = head.querySelector('[data-role="group-tabs"]');
  const search = head.querySelector("input");
  TAG_GROUPS.forEach((g, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = g.label;
    if (i === 0) b.classList.add("active");
    b.addEventListener("click", () => {
      tabs
        .querySelectorAll("button")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      body
        .querySelectorAll(".tag-group")
        .forEach((x) => x.classList.remove("active"));
      body.querySelector(`[data-group="${g.id}"]`).classList.add("active");
    });
    tabs.appendChild(b);
  });

  TAG_GROUPS.forEach((g, i) => {
    const div = document.createElement("div");
    div.className = "tag-group" + (i === 0 ? " active" : "");
    div.dataset.group = g.id;
    div.dataset.kind = g.kind;
    g.tags.forEach((tag) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag;
      pill.title = (g.kind === "audio" ? "音效: " : "风格: ") + tag;
      if (g.kind === "style") {
        if (state.styleTags.has(tag)) pill.classList.add("active");
        pill.addEventListener("click", () => {
          const on = !pill.classList.contains("active");
          pill.classList.toggle("active", on);
          handlers.onStyleTag(tag, on);
        });
      } else {
        pill.addEventListener("click", () => handlers.onAudioTag(tag));
      }
      div.appendChild(pill);
    });
    if (g.id === "role") {
      const tip = document.createElement("p");
      tip.className = "note";
      tip.textContent = "角色标签改变说话风格，基础嗓音仍由预置音色决定；想换嗓音请切换音色或用 VoiceDesign";
      div.appendChild(tip);
    }
    body.appendChild(div);
  });

  // 搜索：跨组过滤，隐藏无匹配 pill；有搜索词时显示所有组
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    body.querySelectorAll(".tag-group").forEach((group) => {
      let visible = 0;
      group.querySelectorAll(".tag-pill").forEach((pill) => {
        const hit = !q || pill.textContent.toLowerCase().includes(q);
        pill.style.display = hit ? "" : "none";
        if (hit) visible++;
      });
      if (q) group.classList.add("active");
      else group.classList.toggle("active", group.dataset.group === "style");
      const empty = group.querySelector(".tag-empty");
      if (empty) empty.remove();
      if (!visible) {
        const tip = document.createElement("div");
        tip.className = "tag-empty";
        tip.textContent = "无匹配标签";
        group.appendChild(tip);
      }
    });
  });
}

/** 渲染选中风格 chip 行 */
export function renderChips(container, state, onRemove) {
  container.textContent = "";
  for (const tag of state.styleTags) {
    const chip = document.createElement("span");
    chip.className = "chip";
    const label = document.createElement("span");
    label.textContent = tag;
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.setAttribute("aria-label", `移除标签 ${tag}`);
    x.addEventListener("click", () => onRemove(tag));
    chip.append(label, x);
    container.appendChild(chip);
  }
}
