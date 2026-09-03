/** 全局状态 + 配置持久化（localStorage 快照 + KV 服务端同步，字段向后兼容） */

export const MODELS = {
  'mimo-v2.5-tts': {
    label: 'TTS',
    desc: '预置精品音色进行语音合成。支持唱歌模式，不支持音色设计与音色复刻。',
    presetVoices: true,
    supportsStream: true,
  },
  'mimo-v2.5-tts-voicedesign': {
    label: 'VoiceDesign',
    desc: '通过文本描述定制音色，无需预置或音频样本。不支持唱歌模式与音色复刻。',
    presetVoices: false,
    supportsStream: false,
  },
  'mimo-v2.5-tts-voiceclone': {
    label: 'VoiceClone',
    desc: '基于音频样本复刻任意音色。不支持唱歌模式与音色设计。',
    presetVoices: false,
    supportsStream: false,
  },
};

export const PRESET_VOICES = [
  { id: 'mimo_default', label: 'MiMo-默认', lang: '双语' },
  { id: '冰糖', label: '冰糖', lang: '中文' },
  { id: '茉莉', label: '茉莉', lang: '中文' },
  { id: '苏打', label: '苏打', lang: '中文' },
  { id: '白桦', label: '白桦', lang: '中文' },
  { id: 'Mia', label: 'Mia', lang: '英文' },
  { id: 'Chloe', label: 'Chloe', lang: '英文' },
  { id: 'Milo', label: 'Milo', lang: '英文' },
  { id: 'Dean', label: 'Dean', lang: '英文' },
];

/** UI 可变状态（单一来源，渲染层订阅） */
export const state = {
  model: 'mimo-v2.5-tts',
  voice: 'mimo_default',
  voiceDesign: '',
  format: 'wav',
  stream: false,
  style: '',
  director: { role: '', scene: '', guide: '' },
  text: '',
  styleTags: new Set(),
  audioTagsUsed: false,
  singing: false,
  optimize: true,
  cloneFile: null, // File 对象，不持久化
};

const LOCAL_KEY = 'mimo_tts_config';

/** 从 state 生成可持久化配置 */
export function collectConfig() {
  return {
    model: state.model,
    format: state.format,
    stream: state.stream,
    voice: state.voice,
    voiceDesign: state.voiceDesign,
    style: state.style,
    directorRole: state.director.role,
    directorScene: state.director.scene,
    directorGuide: state.director.guide,
    text: state.text,
    styleTags: [...state.styleTags],
    singing: state.singing,
    optimize: state.optimize,
  };
}

/** 将配置写回 state（渲染层负责刷新 DOM） */
export function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (cfg.model && MODELS[cfg.model]) state.model = cfg.model;
  if (cfg.format === 'wav' || cfg.format === 'pcm16') state.format = cfg.format;
  if (MODELS[state.model]?.supportsStream && cfg.stream != null) state.stream = !!cfg.stream;
  if (typeof cfg.voice === 'string') state.voice = cfg.voice;
  if (typeof cfg.voiceDesign === 'string') state.voiceDesign = cfg.voiceDesign;
  if (typeof cfg.style === 'string') state.style = cfg.style;
  if (typeof cfg.directorRole === 'string') state.director.role = cfg.directorRole;
  if (typeof cfg.directorScene === 'string') state.director.scene = cfg.directorScene;
  if (typeof cfg.directorGuide === 'string') state.director.guide = cfg.directorGuide;
  if (typeof cfg.text === 'string') state.text = cfg.text;
  if (Array.isArray(cfg.styleTags)) {
    state.styleTags = new Set(cfg.styleTags.filter(t => typeof t === 'string'));
  }
  state.singing = !!cfg.singing;
  if (cfg.optimize != null) state.optimize = cfg.optimize !== false;
  return true;
}

// ---------- 持久化 ----------

let saveTimer = null;
export function scheduleSave(notify) {
  const cfg = collectConfig();
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(cfg)); } catch { /* 忽略配额错误 */ }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const { apiJson } = await import('./api.js');
      const res = await apiJson('/api/config', { method: 'PUT', body: JSON.stringify(cfg) });
      notify?.(res.ok ? 'ok' : 'err');
    } catch {
      notify?.('off');
    }
  }, 800);
}

/** 启动时恢复：本地快照即时，服务端随后覆盖 */
export async function restoreConfig(notify) {
  let restored = false;
  try {
    restored = applyConfig(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'));
  } catch { /* 忽略损坏快照 */ }
  try {
    const { apiJson } = await import('./api.js');
    const res = await apiJson('/api/config');
    if (res.ok && res.data && Object.keys(res.data).length) {
      restored = applyConfig(res.data);
      notify?.('ok');
    } else {
      notify?.(restored ? 'ok' : 'off');
    }
  } catch {
    notify?.('off');
  }
  return restored;
}
