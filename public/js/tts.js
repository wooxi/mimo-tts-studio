/** 合成逻辑：仅代理模式，密钥在 CF Secret，浏览器不接触 */

import { state, MODELS } from './store.js';

const UPSTREAM = '/api/tts';

/** 组装上游请求体（字段与 MiMo chat/completions 接口一致） */
export function buildBody() {
  const messages = [];
  const d = state.director;
  const userContent = [d.role, d.scene, d.guide]
    .map((v, i) => (v ? `${['角色', '场景', '指导'][i]}：${v}` : ''))
    .filter(Boolean)
    .join('\n');
  const userPayload = state.model === 'mimo-v2.5-tts-voicedesign' ? state.voiceDesign : userContent;
  if (userPayload) messages.push({ role: 'user', content: userPayload });

  let assistantText = state.text;
  if (state.styleTags.size) {
    assistantText = `(${[...state.styleTags].join(' ')})${assistantText}`;
  }
  if (state.model === 'mimo-v2.5-tts' && state.singing && !/^\(.*唱歌.*\)/.test(assistantText)) {
    assistantText = `(唱歌)${assistantText}`;
  }
  if (assistantText) messages.push({ role: 'assistant', content: assistantText });

  const audio = { format: state.format };
  if (state.model === 'mimo-v2.5-tts') audio.voice = state.voice;
  if (state.model === 'mimo-v2.5-tts-voicedesign') audio.optimize_text_preview = state.optimize;

  const body = { model: state.model, messages, audio };
  if (state.stream) body.stream = true;
  return body;
}

/** 合成前的校验，返回错误文案或 null */
export function validate() {
  if (!state.text && !(state.model === 'mimo-v2.5-tts-voicedesign' && state.optimize)) {
    return '请输入合成文本';
  }
  if (state.model === 'mimo-v2.5-tts-voicedesign' && !state.voiceDesign.trim()) {
    return 'VoiceDesign 模型需要填写音色描述';
  }
  if (state.model === 'mimo-v2.5-tts-voiceclone' && !state.cloneFile) {
    return 'VoiceClone 模型需要上传音频样本';
  }
  if (state.stream && !MODELS[state.model].supportsStream) {
    return '该模型不支持流式输出，请在设置中关闭流式';
  }
  return null;
}

/** 文件 → dataURL 音色（VoiceClone） */
export async function fileToVoiceData(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  const mime = file.type || 'audio/mpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

/** 非流式合成 → { blob, duration } */
export async function synthesize(body, signal) {
  const res = await fetch(UPSTREAM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Config-Token': tokenHeader() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${errText ? ': ' + errText.slice(0, 300) : ''}`);
  }
  const data = await res.json();
  const audioData = data?.choices?.[0]?.message?.audio?.data;
  if (!audioData) {
    const usage = data?.usage ? ` (usage: ${JSON.stringify(data.usage)})` : '';
    throw new Error('响应中未包含音频数据' + usage);
  }
  const binary = atob(audioData);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/wav' });
  const duration = blob.size > 44 ? Math.round((blob.size - 44) / 24000 / 2) : 0;
  return { blob, duration };
}

/** 流式合成 → { blob, duration }（onProgress 回调报告已接收 KB） */
export async function synthesizeStream(body, onProgress, signal) {
  const res = await fetch(UPSTREAM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Config-Token': tokenHeader() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${errText ? ': ' + errText.slice(0, 300) : ''}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const pcmChunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const audio = parsed?.choices?.[0]?.delta?.audio;
        if (audio?.data) {
          const binary = atob(audio.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          pcmChunks.push(bytes);
          totalBytes += bytes.length;
          onProgress?.(totalBytes);
        }
      } catch { /* 跳过无法解析的行 */ }
    }
  }

  if (!pcmChunks.length) throw new Error('流式响应中未接收到音频数据');

  const total = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of pcmChunks) {
    total.set(chunk, offset);
    offset += chunk.length;
  }

  const blob = pcmToWav(total, 24000);
  return { blob, duration: total.length / 2 / 24000 };
}

function tokenHeader() {
  // api.js 有缓存，这里直接读，避免循环依赖
  return localStorage.getItem('mimo_tts_config_token') || '';
}

export function pcmToWav(pcmBytes, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmBytes.length;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint32(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buf, 44).set(pcmBytes);
  return new Blob([buf], { type: 'audio/wav' });
}

export function formatDuration(sec) {
  const s = Math.floor(sec || 0);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
