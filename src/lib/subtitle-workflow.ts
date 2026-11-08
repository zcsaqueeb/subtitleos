import JSZip from "jszip";
import { parseTimedCaptions } from "./media-tools";

export function subtitleExport(srt: string, kind: "srt" | "vtt" | "txt"): string {
  if (kind === "srt") return srt;
  const cues = parseTimedCaptions(srt);
  if (kind === "txt") return cues.length ? cues.map((cue) => cue.text).join("\n") : srt;
  return "WEBVTT\n\n" + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
}

export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function uniqueSubtitlePath(name: string, language: string, used: Set<string>): string {
  const parts = name.replace(/\\/g, "/").split("/").filter((part) => part && part !== "." && part !== "..");
  const safe = parts.join("/") || "subtitle.srt";
  const dot = safe.lastIndexOf(".");
  const base = dot > safe.lastIndexOf("/") ? safe.slice(0, dot) : safe;
  const ext = dot > safe.lastIndexOf("/") ? safe.slice(dot + 1) : "srt";
  let candidate = `${base}.${language}.${ext}`;
  let index = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base} (${index++}).${language}.${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function translatedZip(items: { name: string; translated?: string; status: string }[], language: string, onProgress?: (percent: number) => void) {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const item of items) {
    if (item.status !== "done" || !item.translated) continue;
    zip.file(uniqueSubtitlePath(item.name, language, used), item.translated);
  }
  return zip.generateAsync({ type: "blob" }, (metadata) => onProgress?.(Math.round(metadata.percent)));
}