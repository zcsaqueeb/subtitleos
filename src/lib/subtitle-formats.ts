/**
 * Multi-format subtitle parser/rebuilder.
 *
 * Goal: extract translatable cue text from any supported format, then
 * rebuild the original file structure with translated text — preserving
 * timestamps, numbering, styling and formatting.
 *
 * Text-based formats are parsed directly. Binary captioning formats
 * (.stl, .scc, .cap, .sup) require specialized decoders/OCR and are
 * intentionally left as "unsupported" so the batch flow can skip them
 * gracefully instead of corrupting the file.
 */

export type SubtitleKind =
  | "srt"
  | "vtt"
  | "sbv"
  | "sub" // MicroDVD
  | "ass" // also covers ssa
  | "ttml" // also covers dfxp, xml
  | "sami"; // smi/sami

export type ParsedSubtitle = {
  kind: SubtitleKind;
  /** Translatable cue text in document order. Multi-line cues are joined with "\n". */
  cues: string[];
  /** Rebuild the original document with translated cues (same length & order). */
  rebuild: (translated: string[]) => string;
};

export const SUPPORTED_SUBTITLE_EXTS = [
  "srt", "vtt", "sbv", "sub",
  "ass", "ssa",
  "ttml", "dfxp", "xml",
  "smi", "sami",
] as const;

/** Binary / OCR-only formats we recognize but cannot translate inline. */
export const UNSUPPORTED_SUBTITLE_EXTS = ["stl", "scc", "cap", "sup"] as const;

export function getExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export function isSupportedSubtitle(name: string): boolean {
  return (SUPPORTED_SUBTITLE_EXTS as readonly string[]).includes(getExt(name));
}

export function isUnsupportedSubtitle(name: string): boolean {
  return (UNSUPPORTED_SUBTITLE_EXTS as readonly string[]).includes(getExt(name));
}

/** Detect kind from extension first, then sniff content as fallback. */
export function detectKind(name: string, content: string): SubtitleKind | null {
  const ext = getExt(name);
  switch (ext) {
    case "srt": return "srt";
    case "vtt": return "vtt";
    case "sbv": return "sbv";
    case "sub": return "sub";
    case "ass":
    case "ssa": return "ass";
    case "ttml":
    case "dfxp":
    case "xml": return "ttml";
    case "smi":
    case "sami": return "sami";
  }
  const head = content.slice(0, 500).toLowerCase();
  if (head.includes("webvtt")) return "vtt";
  if (head.includes("[script info]") || head.includes("[events]")) return "ass";
  if (head.includes("<tt") || head.includes("xmlns=\"http://www.w3.org/ns/ttml")) return "ttml";
  if (head.includes("<sami")) return "sami";
  if (/^\d+\s*\r?\n\d\d:\d\d:\d\d/.test(content)) return "srt";
  if (/^\{\d+\}\{\d+\}/m.test(content)) return "sub";
  return null;
}

export function parse(name: string, content: string): ParsedSubtitle | null {
  const kind = detectKind(name, content);
  if (!kind) return null;
  switch (kind) {
    case "srt": return parseSrt(content);
    case "vtt": return parseVtt(content);
    case "sbv": return parseSbv(content);
    case "sub": return parseMicroDvd(content);
    case "ass": return parseAss(content);
    case "ttml": return parseTtml(content);
    case "sami": return parseSami(content);
  }
}

// ---------- SRT ----------
function parseSrt(text: string): ParsedSubtitle {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\uFEFF/, "");
  const blocks = normalized.split(/\n{2,}/);
  const headers: string[] = [];
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let i = 0;
    while (i < lines.length && !/-->/.test(lines[i])) i++;
    if (i >= lines.length) { headers.push(block); cues.push(""); continue; }
    headers.push(lines.slice(0, i + 1).join("\n"));
    cues.push(lines.slice(i + 1).join("\n"));
  }
  return {
    kind: "srt",
    cues,
    rebuild: (tr) => blocks
      .map((_, idx) => headers[idx] + (tr[idx] !== undefined ? "\n" + tr[idx] : ""))
      .join("\n\n")
      .replace(/\n/g, eol),
  };
}

// ---------- WebVTT ----------
function parseVtt(text: string): ParsedSubtitle {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const cueIdx: number[] = [];
  const headers: string[] = [];
  const bodies: string[] = [];
  blocks.forEach((block, i) => {
    if (/-->/.test(block)) {
      const lines = block.split("\n");
      let h = 0;
      while (h < lines.length && !/-->/.test(lines[h])) h++;
      headers[i] = lines.slice(0, h + 1).join("\n");
      bodies[i] = lines.slice(h + 1).join("\n");
      cueIdx.push(i);
    }
  });
  const cues = cueIdx.map((i) => bodies[i] ?? "");
  return {
    kind: "vtt",
    cues,
    rebuild: (tr) => blocks
      .map((b, i) => {
        const k = cueIdx.indexOf(i);
        if (k === -1) return b;
        const t = tr[k] ?? bodies[i] ?? "";
        return headers[i] + (t ? "\n" + t : "");
      })
      .join("\n\n")
      .replace(/\n/g, eol),
  };
}

// ---------- SBV (YouTube) ----------
function parseSbv(text: string): ParsedSubtitle {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const headers: string[] = [];
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length && /^\d+:\d+:\d+/.test(lines[0])) {
      headers.push(lines[0]);
      cues.push(lines.slice(1).join("\n"));
    } else {
      headers.push(block);
      cues.push("");
    }
  }
  return {
    kind: "sbv",
    cues,
    rebuild: (tr) => blocks
      .map((_, i) => headers[i] + (tr[i] ? "\n" + tr[i] : ""))
      .join("\n\n")
      .replace(/\n/g, eol),
  };
}

// ---------- MicroDVD (.sub) ----------
function parseMicroDvd(text: string): ParsedSubtitle {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cueLines: number[] = [];
  const cues: string[] = [];
  const prefixes: string[] = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\{\d+\}\{\d+\})(.*)$/);
    if (m) {
      cueLines.push(i);
      prefixes[i] = m[1];
      // MicroDVD uses | as a line break
      cues.push(m[2].replace(/\|/g, "\n"));
    }
  });
  return {
    kind: "sub",
    cues,
    rebuild: (tr) => lines
      .map((line, i) => {
        const k = cueLines.indexOf(i);
        if (k === -1) return line;
        const text = (tr[k] ?? cues[k] ?? "").replace(/\n/g, "|");
        return prefixes[i] + text;
      })
      .join(eol),
  };
}

// ---------- ASS / SSA ----------
function parseAss(text: string): ParsedSubtitle {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  // Find Format: header under [Events] to locate the Text column index.
  let textCol = 9;
  for (const line of lines) {
    const m = line.match(/^Format:\s*(.+)$/i);
    if (m && /Text/i.test(m[1])) {
      const cols = m[1].split(",").map((s) => s.trim());
      const idx = cols.findIndex((c) => /^text$/i.test(c));
      if (idx >= 0) textCol = idx;
      break;
    }
  }
  const cueLines: number[] = [];
  const prefixes: string[] = [];
  const cues: string[] = [];
  lines.forEach((line, i) => {
    if (/^Dialogue\s*:/i.test(line)) {
      // Split on the first `textCol` commas; the rest is the text (may contain commas).
      const body = line.replace(/^Dialogue\s*:\s*/i, "");
      const parts: string[] = [];
      let rest = body;
      for (let c = 0; c < textCol; c++) {
        const idx = rest.indexOf(",");
        if (idx === -1) { parts.push(rest); rest = ""; break; }
        parts.push(rest.slice(0, idx));
        rest = rest.slice(idx + 1);
      }
      cueLines.push(i);
      prefixes[i] = "Dialogue: " + parts.join(",") + ",";
      cues.push(rest.replace(/\\N/g, "\n"));
    }
  });
  return {
    kind: "ass",
    cues,
    rebuild: (tr) => lines
      .map((line, i) => {
        const k = cueLines.indexOf(i);
        if (k === -1) return line;
        const t = (tr[k] ?? cues[k] ?? "").replace(/\n/g, "\\N");
        return prefixes[i] + t;
      })
      .join(eol),
  };
}

// ---------- TTML / DFXP / XML ----------
function parseTtml(text: string): ParsedSubtitle {
  // Regex-based <p ...>...</p> extraction. Preserves the wrapper exactly.
  const re = /(<p\b[^>]*>)([\s\S]*?)(<\/p\s*>)/gi;
  const opens: string[] = [];
  const closes: string[] = [];
  const cues: string[] = [];
  const segments: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    opens.push(m[1]);
    cues.push(decodeXmlText(m[2]));
    closes.push(m[3]);
    segments.push({ start: m.index, end: re.lastIndex });
  }
  return {
    kind: "ttml",
    cues,
    rebuild: (tr) => {
      let out = "";
      let cursor = 0;
      segments.forEach((seg, i) => {
        out += text.slice(cursor, seg.start);
        const t = tr[i] !== undefined ? tr[i] : cues[i];
        out += opens[i] + encodeXmlText(t).replace(/\n/g, "<br/>") + closes[i];
        cursor = seg.end;
      });
      out += text.slice(cursor);
      return out;
    },
  };
}

// ---------- SAMI / SMI ----------
function parseSami(text: string): ParsedSubtitle {
  // Each <SYNC> block holds one or more <P>text</P> entries. Extract <P>.
  const re = /(<p\b[^>]*>)([\s\S]*?)(?=<\/p\s*>|<sync\b|<\/body)/gi;
  const opens: string[] = [];
  const cues: string[] = [];
  const segments: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const inner = m[2]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!inner) continue;
    opens.push(m[1]);
    cues.push(decodeXmlText(inner));
    segments.push({ start: m.index, end: re.lastIndex });
  }
  return {
    kind: "sami",
    cues,
    rebuild: (tr) => {
      let out = "";
      let cursor = 0;
      segments.forEach((seg, i) => {
        out += text.slice(cursor, seg.start);
        const t = tr[i] !== undefined ? tr[i] : cues[i];
        out += opens[i] + encodeXmlText(t).replace(/\n/g, "<br>");
        cursor = seg.end;
      });
      out += text.slice(cursor);
      return out;
    },
  };
}

// ---------- helpers ----------
function decodeXmlText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}
function encodeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build a minimal SRT from a cue array — used to feed the translator,
 * which expects SRT-shaped input. Returns the SRT plus a parser to map
 * the translated SRT back to a flat cue array of the same length.
 */
export function cuesToSrt(cues: string[]): string {
  return cues
    .map((c, i) => {
      const start = formatSrtTime(i * 2);
      const end = formatSrtTime(i * 2 + 1);
      // Avoid empty cues breaking SRT block splitting.
      const body = (c ?? "").replace(/\n{2,}/g, "\n").trim() || "\u200B";
      return `${i + 1}\n${start} --> ${end}\n${body}`;
    })
    .join("\n\n");
}

export function srtToCues(srt: string, expected: number): string[] {
  const blocks = srt.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  const out: string[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    let i = 0;
    while (i < lines.length && !/-->/.test(lines[i])) i++;
    const text = lines.slice(i + 1).join("\n").replace(/\u200B/g, "").trim();
    out.push(text);
  }
  while (out.length < expected) out.push("");
  return out.slice(0, expected);
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},000`;
}
