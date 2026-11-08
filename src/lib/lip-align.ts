// Browser-side frame-accurate alignment between a video's original audio and a
// dubbed voice track. Everything here runs in the browser (Web Audio + canvas
// free); no server round-trip and no API key required.

export type AlignResult = {
  /** Best offset in seconds: positive means the dub should start later. */
  offsetSeconds: number;
  /** Same offset expressed in whole video frames. */
  offsetFrames: number;
  /** Detected/assumed frame rate used for snapping. */
  fps: number;
  /** 0..1 — how strong the match was. Low values mean "guess, please check". */
  confidence: number;
};

export const ENVELOPE_HZ = 100; // 10 ms analysis grid — finer than one video frame.

/** Estimate the real frame rate of a video element by watching presented frames. */
export async function detectFps(video: HTMLVideoElement, samples = 12): Promise<number> {
  const anyVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void) => number;
  };
  if (typeof anyVideo.requestVideoFrameCallback !== "function") return 25;

  return new Promise<number>((resolve) => {
    let first: { mediaTime: number; presentedFrames: number } | null = null;
    let count = 0;
    const done = (v: number) => resolve(Math.max(1, Math.min(120, v)));
    const timer = setTimeout(() => done(25), 3000);

    const step = (_now: number, meta: { mediaTime: number; presentedFrames: number }) => {
      if (!first) first = { ...meta };
      count++;
      if (count >= samples) {
        clearTimeout(timer);
        const dt = meta.mediaTime - first.mediaTime;
        const df = meta.presentedFrames - first.presentedFrames;
        if (dt > 0 && df > 0) {
          const raw = df / dt;
          // Snap to the usual broadcast rates.
          const known = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
          const near = known.find((k) => Math.abs(k - raw) < 0.6);
          done(near ?? Math.round(raw));
        } else done(25);
        return;
      }
      anyVideo.requestVideoFrameCallback!(step);
    };
    anyVideo.requestVideoFrameCallback!(step);
  });
}

async function decode(blob: Blob): Promise<AudioBuffer> {
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctx();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

/** Loudness envelope at ENVELOPE_HZ, mean-removed and normalised. */
function envelope(buf: AudioBuffer): Float32Array {
  const step = Math.max(1, Math.round(buf.sampleRate / ENVELOPE_HZ));
  const frames = Math.floor(buf.length / step);
  const out = new Float32Array(frames);
  const ch = buf.numberOfChannels;

  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      const start = i * step;
      const end = start + step;
      for (let s = start; s < end; s++) sum += d[s]! * d[s]!;
    }
    out[i] = Math.sqrt(sum / (step * ch));
  }

  // Emphasise speech onsets: half-wave rectified first difference.
  const onset = new Float32Array(frames);
  for (let i = 1; i < frames; i++) onset[i] = Math.max(0, out[i]! - out[i - 1]!);

  let mean = 0;
  for (let i = 0; i < frames; i++) mean += onset[i]!;
  mean /= Math.max(1, frames);
  let norm = 0;
  for (let i = 0; i < frames; i++) {
    onset[i] = onset[i]! - mean;
    norm += onset[i]! * onset[i]!;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < frames; i++) onset[i] = onset[i]! / norm;
  return onset;
}

/**
 * Cross-correlate the dub against the original audio to find the lag where the
 * speech onsets line up, then snap that lag to the nearest whole video frame so
 * the mouth shapes land on real frame boundaries.
 */
export async function alignDubToVideo(
  videoFile: Blob,
  dubBlob: Blob,
  fps: number,
  maxLagSeconds = 5,
): Promise<AlignResult> {
  const [vBuf, dBuf] = await Promise.all([decode(videoFile), decode(dubBlob)]);
  const a = envelope(vBuf);
  const b = envelope(dBuf);

  const maxLag = Math.round(maxLagSeconds * ENVELOPE_HZ);
  let bestLag = 0;
  let best = -Infinity;
  let second = -Infinity;

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let dot = 0;
    const start = Math.max(0, -lag);
    const end = Math.min(b.length, a.length - lag);
    if (end - start < ENVELOPE_HZ) continue; // need at least a second of overlap
    for (let i = start; i < end; i++) dot += b[i]! * a[i + lag]!;
    if (dot > best) {
      second = best;
      best = dot;
      bestLag = lag;
    } else if (dot > second) second = dot;
  }

  const raw = bestLag / ENVELOPE_HZ;
  const offsetFrames = Math.round(raw * fps);
  const offsetSeconds = offsetFrames / fps;
  const confidence =
    Number.isFinite(best) && best > 0 ? Math.max(0, Math.min(1, (best - Math.max(0, second)) / best)) : 0;

  return { offsetSeconds, offsetFrames, fps, confidence };
}

/** Speech-onset envelope of any audio blob, sampled at ENVELOPE_HZ. */
export async function audioOnsetEnvelope(blob: Blob): Promise<Float32Array> {
  return envelope(await decode(blob));
}

/** Normalise an arbitrary curve the same way envelope() does, for cross-correlation. */
export function normaliseCurve(src: Float32Array): Float32Array {
  const n = src.length;
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, src[i]! - src[i - 1]!);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onset[i]!;
  mean /= Math.max(1, n);
  let norm = 0;
  for (let i = 0; i < n; i++) { onset[i] = onset[i]! - mean; norm += onset[i]! * onset[i]!; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < n; i++) onset[i] = onset[i]! / norm;
  return onset;
}

/** Cross-correlate two already-normalised curves; returns best lag in samples + confidence. */
export function bestLag(a: Float32Array, b: Float32Array, maxLag: number) {
  let bestL = 0, best = -Infinity, second = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let dot = 0;
    const start = Math.max(0, -lag);
    const end = Math.min(b.length, a.length - lag);
    if (end - start < ENVELOPE_HZ) continue;
    for (let i = start; i < end; i++) dot += b[i]! * a[i + lag]!;
    if (dot > best) { second = best; best = dot; bestL = lag; }
    else if (dot > second) second = dot;
  }
  const confidence =
    Number.isFinite(best) && best > 0 ? Math.max(0, Math.min(1, (best - Math.max(0, second)) / best)) : 0;
  return { lag: bestL, confidence };
}

function encodeWav(buf: AudioBuffer): Blob {
  const ch = Math.min(2, buf.numberOfChannels);
  const len = buf.length;
  const bytes = 44 + len * ch * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

  str(0, "RIFF"); view.setUint32(4, bytes - 8, true); str(8, "WAVE");
  str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, ch, true); view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true); view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true); str(36, "data"); view.setUint32(40, len * ch * 2, true);

  let o = 44;
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

/**
 * Bake an offset into the dub track (pad with silence or trim the head) and
 * return a WAV, so the file handed to the lip-sync engine is already aligned
 * to the video's timeline frame for frame.
 */
export async function buildAlignedDub(
  dubBlob: Blob,
  offsetSeconds: number,
  videoDuration: number,
): Promise<Blob> {
  const src = await decode(dubBlob);
  const rate = src.sampleRate;
  const ch = Math.min(2, src.numberOfChannels);
  const total = Math.max(1, Math.round((videoDuration || src.duration) * rate));
  const shift = Math.round(offsetSeconds * rate);

  const OfflineCtx = window.OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  const out: AudioBuffer = new OfflineCtx(ch, total, rate).createBuffer(ch, total, rate);

  for (let c = 0; c < ch; c++) {
    const from = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
    const to = out.getChannelData(c);
    for (let i = 0; i < total; i++) {
      const j = i - shift;
      if (j >= 0 && j < from.length) to[i] = from[j]!;
    }
  }
  return encodeWav(out);
}
