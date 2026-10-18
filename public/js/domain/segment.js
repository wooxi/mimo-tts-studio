/**
 * Long-script segmentation.
 *
 * All three TTS models share an 8K context window, and the official guidance
 * is to synthesise in one go up to roughly 2500 characters, then split on
 * sentence boundaries and concatenate. This module does the splitting; the
 * concatenation happens in the synth engine, because only it knows whether the
 * pieces came back as PCM16 (trivially joinable) or as containers.
 */

const SENTENCE_END = /[。！？!?…；;\n]+/;
const SOFT_BREAK = /[，,、：:—–]/;

/**
 * Split into chunks of at most `max` characters, preferring sentence ends and
 * falling back to clause punctuation, then to a hard cut.
 *
 * A leading `(风格)` group is repeated on every chunk: it is not spoken, and
 * repeating it is what keeps prosody consistent across the seam.
 */
export function splitScript(text, max = 2500) {
  const src = String(text || "");
  if (src.length <= max) return [src];

  const leadMatch = src.match(/^\s*[(（[\[［【][^)）\]］】]{1,40}[)）\]］】]/);
  const lead = leadMatch ? leadMatch[0] : "";
  const body = src.slice(lead.length).trim();

  const pieces = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) pieces.push(t);
    buf = "";
  };

  for (const sentence of splitKeep(body, SENTENCE_END)) {
    if (sentence.length > max) {
      // A single monster sentence: fall back to clause punctuation.
      flush();
      for (const clause of splitKeep(sentence, SOFT_BREAK)) {
        if (buf.length + clause.length > max) flush();
        if (clause.length > max) {
          for (let i = 0; i < clause.length; i += max) {
            pieces.push(clause.slice(i, i + max));
          }
        } else {
          buf += clause;
        }
      }
      flush();
      continue;
    }

    if (buf.length + sentence.length > max) flush();
    buf += sentence;
  }
  flush();

  return pieces.map((p) => (lead ? `${lead}${p}` : p));
}

/** Split but keep the delimiters attached to the piece they terminate. */
function splitKeep(text, re) {
  const out = [];
  let start = 0;
  const rx = new RegExp(re.source, "g");
  let m;
  while ((m = rx.exec(text))) {
    const end = m.index + m[0].length;
    const piece = text.slice(start, end);
    if (piece) out.push(piece);
    start = end;
  }
  const tail = text.slice(start);
  if (tail) out.push(tail);
  return out;
}

/** How the UI describes a split before the user commits to it. */
export function planSegments(text, max = 2500) {
  const parts = splitScript(text, max);
  return {
    count: parts.length,
    lengths: parts.map((p) => p.length),
    needed: parts.length > 1,
  };
}
