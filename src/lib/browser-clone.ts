// Browser-only open-source voice synthesis using @huggingface/transformers.
// Runs entirely on-device (WebGPU/WASM); no API key, no upload.
// Quality is meaningfully below cloud providers — labeled "experimental" in UI.
//
// Public API:
//   - saveCloneSample(characterId, blob) — store a sample WAV/MP3 in IndexedDB.
//   - hasCloneSample(characterId)
//   - synthesizeBrowser({ text, characterId? }) — returns a Blob (audio/wav).

const DB_NAME = "subtitleos-browser-clone";
const STORE = "samples";
const MODEL_ID = "Xenova/speecht5_tts";
const VOCODER_ID = "Xenova/speecht5_hifigan";
const DEFAULT_EMBEDDING_URL =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

type Sample = { id: string; blob: Blob; savedAt: number };

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCloneSample(characterId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id: characterId, blob, savedAt: Date.now() } satisfies Sample);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function hasCloneSample(characterId: string): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(characterId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function getSample(characterId: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(characterId);
      req.onsuccess = () => resolve((req.result as Sample | undefined)?.blob ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Lazily loaded pipeline (heavy model, ~200MB first download).
let _tts: any | null = null;
let _loadingPromise: Promise<any> | null = null;

async function loadPipeline(onProgress?: (p: number) => void) {
  if (_tts) return _tts;
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const tts = await pipeline("text-to-speech", MODEL_ID, {
      dtype: "fp32",
      progress_callback: (p: any) => {
        if (onProgress && typeof p?.progress === "number") onProgress(p.progress);
      },
    });
    _tts = tts;
    return tts;
  })();
  return _loadingPromise;
}

async function fetchDefaultSpeakerEmbedding(): Promise<Float32Array> {
  const r = await fetch(DEFAULT_EMBEDDING_URL);
  const buf = await r.arrayBuffer();
  return new Float32Array(buf);
}

// Derive a very rough speaker embedding from the user's sample by taking the
// first 512 mean-pooled float samples of the decoded audio. This is a stand-in:
// true x-vector extraction would need a separate speaker-encoder model. It gives
// the model *some* per-user variation while keeping the runtime lean.
async function embedFromSample(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const audio = await ctx.decodeAudioData(arrayBuf.slice(0));
    const ch = audio.getChannelData(0);
    const out = new Float32Array(512);
    const step = Math.max(1, Math.floor(ch.length / 512));
    for (let i = 0; i < 512; i++) {
      let sum = 0;
      const start = i * step;
      const end = Math.min(ch.length, start + step);
      for (let j = start; j < end; j++) sum += ch[j];
      out[i] = sum / Math.max(1, end - start);
    }
    // Mix ~30% sample signature into the default embedding for stability.
    const def = await fetchDefaultSpeakerEmbedding();
    const mixed = new Float32Array(def.length);
    for (let i = 0; i < def.length; i++) {
      mixed[i] = def[i] * 0.7 + (out[i % out.length] ?? 0) * 0.3;
    }
    return mixed;
  } finally {
    ctx.close();
  }
}

function floatToWav(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function synthesizeBrowser(opts: {
  text: string;
  characterId?: string;
  onLoadProgress?: (p: number) => void;
}): Promise<Blob> {
  const text = opts.text.trim();
  if (!text) throw new Error("Empty text");
  const tts = await loadPipeline(opts.onLoadProgress);
  const sample = opts.characterId ? await getSample(opts.characterId) : null;
  const speaker_embeddings = sample
    ? await embedFromSample(sample)
    : await fetchDefaultSpeakerEmbedding();
  const out: any = await tts(text.slice(0, 500), {
    speaker_embeddings,
    vocoder: VOCODER_ID,
  });
  const audio: Float32Array = out.audio;
  const sr: number = out.sampling_rate ?? 16000;
  return floatToWav(audio, sr);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
