/**
 * Model + voice catalogue.
 *
 * Everything here mirrors the published MiMo-V2.5-TTS API surface. Capability
 * flags are what the UI branches on, so a model's limits are declared once
 * instead of being re-derived in every view.
 *
 * Sources: mimo.mi.com speech-synthesis-v2.5 guide and the /api/audio/tts
 * reference. Values the docs leave unspecified are marked in comments rather
 * than guessed at.
 */

export const TTS_MODELS = [
  {
    id: "mimo-v2.5-tts",
    label: "预置音色",
    short: "TTS",
    desc: "内置精品音色，直接用；支持唱歌与真·低延迟流式。",
    voiceSource: "preset",
    caps: {
      presetVoices: true,
      voiceDesign: false,
      voiceClone: false,
      singing: true,
      inlineTags: true,
      naturalLanguage: true,
      optimizeText: false,
      realtimeStream: true,
    },
  },
  {
    id: "mimo-v2.5-tts-voicedesign",
    label: "音色设计",
    short: "VoiceDesign",
    desc: "用一段文字描述凭空造一个嗓音，不需要样本。",
    voiceSource: "description",
    caps: {
      presetVoices: false,
      voiceDesign: true,
      voiceClone: false,
      singing: false,
      // The official MiMo-Skills reference states inline tags are NOT
      // supported by this model; the UI warns instead of silently ignoring.
      inlineTags: false,
      naturalLanguage: true,
      optimizeText: true,
      realtimeStream: false,
    },
  },
  {
    id: "mimo-v2.5-tts-voiceclone",
    label: "音色克隆",
    short: "VoiceClone",
    desc: "上传一段 mp3/wav 样本，复刻这个嗓音来说任意台词。",
    voiceSource: "sample",
    caps: {
      presetVoices: false,
      voiceDesign: false,
      voiceClone: true,
      singing: false,
      inlineTags: true,
      naturalLanguage: true,
      optimizeText: false,
      realtimeStream: false,
    },
  },
];

export const MODEL_BY_ID = Object.fromEntries(TTS_MODELS.map((m) => [m.id, m]));

export const modelOf = (id) => MODEL_BY_ID[id] || TTS_MODELS[0];

/**
 * Built-in voices. IDs are literal, including the Chinese ones.
 * `mimo_default` resolves per cluster — China → 冰糖, elsewhere → Mia — which
 * is worth surfacing because it makes a saved preset non-portable.
 */
export const PRESET_VOICES = [
  { id: "mimo_default", name: "MiMo 默认", lang: "双语", gender: "", style: "随集群而异" },
  { id: "冰糖", name: "冰糖", lang: "中文", gender: "女", style: "活泼少女" },
  { id: "茉莉", name: "茉莉", lang: "中文", gender: "女", style: "知性女声" },
  { id: "苏打", name: "苏打", lang: "中文", gender: "男", style: "阳光少年" },
  { id: "白桦", name: "白桦", lang: "中文", gender: "男", style: "成熟男声" },
  { id: "Mia", name: "Mia", lang: "英文", gender: "女", style: "Lively girl" },
  { id: "Chloe", name: "Chloe", lang: "英文", gender: "女", style: "Sweet & dreamy" },
  { id: "Milo", name: "Milo", lang: "英文", gender: "男", style: "Sunny boy" },
  { id: "Dean", name: "Dean", lang: "英文", gender: "男", style: "Steady, gentle" },
];

export const voiceOf = (id) =>
  PRESET_VOICES.find((v) => v.id === id) || PRESET_VOICES[0];

/** Output container formats. `pcm` and `pcm16` are the same thing upstream. */
export const FORMATS = [
  { id: "wav", label: "WAV", note: "无损，体积最大" },
  { id: "mp3", label: "MP3", note: "体积小，便于分享" },
  { id: "pcm16", label: "PCM16", note: "裸流，24kHz 单声道" },
];

/** Output is 24kHz 16-bit mono for PCM16 (documented in every official sample). */
export const SAMPLE_RATE = 24000;

/**
 * Published limits.
 *  - 8K context / 8K max output tokens for all three TTS models.
 *  - 100 RPM, 10M TPM per account per model.
 *  - Clone reference: mp3/wav, base64 ≤ 10MB.
 *  - The MiMo Studio UI caps its own text fields at 1024 characters; the API
 *    does not publish a character cap, so we treat 2500 as the practical
 *    segmentation threshold (matches the official skill's guidance).
 */
export const LIMITS = {
  contextTokens: 8192,
  maxOutputTokens: 8192,
  charsPerToken: 1.6,
  segmentAt: 2500,
  hardChars: 20000,
  cloneBase64Bytes: 10 * 1024 * 1024,
  audioBytes: 25 * 1024 * 1024,
};

/** Rough token count for a mixed Chinese/English string. */
export function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) if (/[\u3400-\u9fff\uf900-\ufaff]/.test(ch)) cjk++;
  const rest = text.length - cjk;
  return Math.round(cjk * 1.05 + rest / 3.6);
}
