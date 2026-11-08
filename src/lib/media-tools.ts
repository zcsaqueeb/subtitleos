export type TimedCaption = { start: number; end: number; text: string };

export function captionTime(value: string): number {
  const parts = value.trim().replace(",", ".").split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function srtTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(total / 3600000)).padStart(2, "0")}:${String(Math.floor(total / 60000) % 60).padStart(2, "0")}:${String(Math.floor(total / 1000) % 60).padStart(2, "0")},${String(total % 1000).padStart(3, "0")}`;
}

export function parseTimedCaptions(content: string): TimedCaption[] {
  const captions: TimedCaption[] = [];
  const clean = content.replace(/\r/g, "").replace(/^\uFEFF/, "");
  for (const block of clean.split(/\n\s*\n/)) {
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(block)) continue;
    const lines = block.split("\n");
    const index = lines.findIndex((line) => line.includes("-->"));
    if (index < 0) continue;
    const match = lines[index].match(/(\d+(?::\d+){1,2}[.,]\d+)\s*-->\s*(\d+(?::\d+){1,2}[.,]\d+)/);
    if (!match) continue;
    const start = captionTime(match[1]);
    const end = captionTime(match[2]);
    const text = lines.slice(index + 1).join("\n").replace(/<[^>]*>/g, "").trim();
    if (end > start && text) captions.push({ start, end, text });
  }
  if (!captions.length) {
    for (const line of clean.split("\n")) {
      if (!/^Dialogue:/i.test(line)) continue;
      const fields = line.slice(line.indexOf(":") + 1).split(",");
      const start = captionTime(fields[1] ?? "");
      const end = captionTime(fields[2] ?? "");
      const text = fields.slice(9).join(",").replace(/\{[^}]*\}/g, "").replace(/\\[Nn]/g, "\n").trim();
      if (end > start && text) captions.push({ start, end, text });
    }
  }
  return captions.sort((a, b) => a.start - b.start);
}

export function captionsToSrt(captions: TimedCaption[], offset = 0): string {
  return captions.filter((cue) => cue.end + offset > 0).map((cue, i) =>
    `${i + 1}\n${srtTimestamp(cue.start + offset)} --> ${srtTimestamp(cue.end + offset)}\n${cue.text}`,
  ).join("\n\n");
}

export function activeCaption(captions: TimedCaption[], time: number, offset = 0): string {
  return captions.filter((cue) => time >= cue.start + offset && time < cue.end + offset).map((cue) => cue.text).join("\n");
}

export function videoOnlyArgs(args: string[], videoGraph: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "-map" && args[i + 1] === "[a]") || ["-c:a", "-b:a"].includes(args[i])) { i++; continue; }
    result.push(args[i]);
    if (args[i] === "-filter_complex") { result.push(videoGraph); i++; }
  }
  return result;
}