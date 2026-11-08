import { parseTimedCaptions } from "./media-tools";

export function summaryTranscript(text: string): string {
  const cues = parseTimedCaptions(text);
  return cues.length ? cues.map((cue) => cue.text).join("\n") : text.trim();
}

export function summaryPlainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .trim();
}

export function summaryBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "summary";
}