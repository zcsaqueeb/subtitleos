// Client-side audio splitter. Decodes a media file via Web Audio (works for
// any container the browser can decode: MP4/WebM/MOV/MP3/WAV/M4A/OGG/FLAC),
// then encodes ~`chunkSeconds`-long mono 16 kHz WAV chunks.
//
// Sync accuracy: instead of cutting on a fixed sample boundary (which lands
// mid-word 90% of the time and offsets every following cue by the truncated
// syllable), we snap each cut to the quietest ~200 ms window within a ±8 s
// search around the target. Cuts land in silence → adjacent cues line up
// naturally, no overlap/dedup needed.

export type AudioChunk = { blob: Blob; startSec: number; endSec: number; index: number };

const TARGET_SAMPLE_RATE = 16000;

function downsampleMono(buffer: AudioBuffer, targetRate = TARGET_SAMPLE_RATE): Float32Array {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += data[i] / ch;
  }
  if (buffer.sampleRate === targetRate) return mono;
  const ratio = buffer.sampleRate / targetRate;
  const outLen = Math.floor(len / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(len, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += mono[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// Find the quietest 200 ms window inside [minIdx, maxIdx] using a prefix-sum
// energy table (O(1) per candidate instead of O(window)). Returns the sample
// index at the *center* of that window — the ideal cut point.
function findQuietestCut(
  cumEnergy: Float64Array,
  minIdx: number,
  maxIdx: number,
  sampleRate: number,
): number {
  const n = cumEnergy.length - 1;
  const winSamples = Math.max(1, Math.floor(sampleRate * 0.2));
  const lo = Math.max(0, Math.min(n, minIdx));
  const hi = Math.max(lo, Math.min(n, maxIdx));
  if (hi - lo <= winSamples) return Math.floor((lo + hi) / 2);
  const hop = Math.max(1, Math.floor(sampleRate * 0.02));
  let bestCenter = Math.floor((lo + hi) / 2);
  let bestEnergy = Infinity;
  for (let start = lo; start + winSamples <= hi; start += hop) {
    const sum = cumEnergy[start + winSamples] - cumEnergy[start];
    if (sum < bestEnergy) {
      bestEnergy = sum;
      bestCenter = start + (winSamples >> 1);
    }
  }
  return bestCenter;
}

// Decode straight to 16 kHz using an OfflineAudioContext — the browser does
// the resampling natively (C++/SIMD), which is ~10-40x faster than the JS
// averaging loop and avoids allocating a full-rate mono buffer first.
async function decodeAt16k(buf: ArrayBuffer): Promise<AudioBuffer | null> {
  try {
    const OAC = (window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext);
    if (!OAC) return null;
    const octx = new OAC(1, 1, TARGET_SAMPLE_RATE);
    const decoded = await octx.decodeAudioData(buf);
    return decoded.sampleRate === TARGET_SAMPLE_RATE ? decoded : null;
  } catch {
    return null;
  }
}

export async function chunkMediaFile(
  file: File,
  opts: { chunkSeconds?: number; onProgress?: (msg: string) => void } = {},
): Promise<{ chunks: AudioChunk[]; durationSec: number }> {
  const chunkSeconds = opts.chunkSeconds ?? 180;
  // Snap window: how far we're willing to slide the cut to land in silence.
  const snapWindowSec = Math.min(8, Math.max(2, Math.floor(chunkSeconds * 0.05)));
  opts.onProgress?.("Decoding audio…");
  const buf = await file.arrayBuffer();

  // Fast path: decode + resample to 16 kHz in one native step.
  let mono: Float32Array | null = null;
  const fast = await decodeAt16k(buf.slice(0));
  if (fast) {
    if (fast.numberOfChannels === 1) {
      mono = fast.getChannelData(0);
    } else {
      opts.onProgress?.("Mixing to mono…");
      const len = fast.length;
      const out = new Float32Array(len);
      const ch = fast.numberOfChannels;
      for (let c = 0; c < ch; c++) {
        const d = fast.getChannelData(c);
        for (let i = 0; i < len; i++) out[i] += d[i] / ch;
      }
      mono = out;
    }
  }

  if (!mono) {
    // Fallback: full-rate decode, then JS downsample.
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AC();
    let decoded: AudioBuffer;
    try { decoded = await ctx.decodeAudioData(buf.slice(0)); }
    catch { await ctx.close().catch(() => {}); throw new Error("Your browser couldn't decode this file. Try MP4/WebM/MP3/WAV/M4A/OGG."); }
    await ctx.close().catch(() => {});
    opts.onProgress?.("Resampling to 16 kHz mono…");
    mono = downsampleMono(decoded, TARGET_SAMPLE_RATE);
  }

  opts.onProgress?.("Finding silent cut points…");
  const total = mono.length;
  const samplesPerChunk = chunkSeconds * TARGET_SAMPLE_RATE;
  const snapSamples = snapWindowSec * TARGET_SAMPLE_RATE;

  // Prefix-sum of squared amplitude — one pass, then O(1) window energy.
  const cumEnergy = new Float64Array(total + 1);
  for (let i = 0; i < total; i++) cumEnergy[i + 1] = cumEnergy[i] + mono[i] * mono[i];

  // Compute silence-aware cut points, then slice.
  const cuts: number[] = [0];
  let target = samplesPerChunk;
  while (target < total) {
    const cut = findQuietestCut(
      cumEnergy,
      Math.max(cuts[cuts.length - 1] + Math.floor(samplesPerChunk * 0.5), target - snapSamples),
      Math.min(total, target + snapSamples),
      TARGET_SAMPLE_RATE,
    );
    cuts.push(cut);
    target = cut + samplesPerChunk;
  }
  cuts.push(total);


  const chunks: AudioChunk[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < TARGET_SAMPLE_RATE * 0.25) continue; // drop <250 ms slivers
    const slice = mono.subarray(a, b);
    chunks.push({
      blob: encodeWav(slice, TARGET_SAMPLE_RATE),
      startSec: a / TARGET_SAMPLE_RATE,
      endSec: b / TARGET_SAMPLE_RATE,
      index: chunks.length,
    });
  }
  return { chunks, durationSec: total / TARGET_SAMPLE_RATE };
}

const toTime = (s: string): number => {
  const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
};
const fmtTime = (sec: number): string => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  const mmm = String(ms % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
};

// Shift a chunk's SRT into the timeline and clamp cue times to [0, chunkDurSec]
// before offsetting — providers occasionally emit end times that overshoot the
// clip by a few hundred ms, which would then bleed into the next chunk's cues.
export function shiftSrt(
  srt: string,
  offsetSec: number,
  startCueNumber: number,
  chunkDurSec?: number,
): { srt: string; nextCueNumber: number } {
  const blocks = srt.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let n = startCueNumber;
  const out: string[] = [];
  for (const b of blocks) {
    const lines = b.split(/\r?\n/);
    const tIdx = lines.findIndex((l) => l.includes("-->"));
    if (tIdx < 0) continue;
    const [a, c] = lines[tIdx].split("-->").map((s) => s.trim());
    let start = toTime(a);
    let end = toTime(c);
    if (chunkDurSec != null) {
      start = Math.max(0, Math.min(start, chunkDurSec));
      end = Math.max(start + 0.05, Math.min(end, chunkDurSec));
    }
    if (end <= start) end = start + 0.05;
    const text = lines.slice(tIdx + 1).join("\n").trim();
    if (!text) continue;
    out.push(`${n}\n${fmtTime(start + offsetSec)} --> ${fmtTime(end + offsetSec)}\n${text}`);
    n++;
  }
  return { srt: out.join("\n\n"), nextCueNumber: n };
}

export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
  return srt.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).flatMap((b) => {
    const lines = b.split(/\r?\n/);
    const tIdx = lines.findIndex((l) => l.includes("-->"));
    if (tIdx < 0) return [];
    const [a, c] = lines[tIdx].split("-->").map((s) => s.trim());
    return [{ start: toTime(a), end: toTime(c), text: lines.slice(tIdx + 1).join("\n") }];
  });
}
