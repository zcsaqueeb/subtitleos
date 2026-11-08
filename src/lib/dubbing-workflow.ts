import { captionsToSrt, parseTimedCaptions } from "./media-tools";

export function dubAudioFilter(offset: number, end: number | null, volume: number): string {
  const trimStart = Math.max(0, -offset);
  const duration = end == null ? null : Math.max(0, end - Math.max(0, offset));
  const trim = `atrim=start=${trimStart}${duration == null ? "" : `:duration=${duration}`},asetpts=PTS-STARTPTS`;
  return `${trim},adelay=${Math.max(0, Math.round(offset * 1000))}:all=1,volume=${volume.toFixed(2)},apad`;
}

export function normalizeDubScript(text: string): string {
  const cues = parseTimedCaptions(text);
  return cues.length ? captionsToSrt(cues) : text.trim();
}

export function mediaExtension(mime: string): string {
  return mime.includes("wav") ? "wav" : mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "mp3";
}