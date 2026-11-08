/**
 * Browser-side archive extractor. Returns flat `{name, content}` entries
 * for any text file inside the archive. Unsupported archive types throw
 * a clear, user-facing error.
 *
 * Supported: .zip, .tar, .tar.gz / .tgz
 * Unsupported in-browser (asks user to convert to zip): .rar, .7z
 */
import JSZip from "jszip";
import * as pako from "pako";

export type ArchiveEntry = { name: string; content: string };

export function archiveKind(name: string): "zip" | "tar" | "tgz" | "rar" | "7z" | null {
  const n = name.toLowerCase();
  if (n.endsWith(".zip")) return "zip";
  if (n.endsWith(".tar.gz") || n.endsWith(".tgz")) return "tgz";
  if (n.endsWith(".tar")) return "tar";
  if (n.endsWith(".rar")) return "rar";
  if (n.endsWith(".7z")) return "7z";
  return null;
}

export async function extractArchive(file: File): Promise<ArchiveEntry[]> {
  const kind = archiveKind(file.name);
  if (!kind) throw new Error("Unsupported archive type.");
  if (kind === "rar" || kind === "7z") {
    throw new Error(
      `${kind.toUpperCase()} archives can't be opened in the browser. Please repack as .zip or .tar.gz and re-upload.`,
    );
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  if (kind === "zip") return await readZip(buf);
  if (kind === "tar") return readTar(buf);
  if (kind === "tgz") return readTar(pako.ungzip(buf));
  return [];
}

async function readZip(buf: Uint8Array): Promise<ArchiveEntry[]> {
  const zip = await JSZip.loadAsync(buf);
  const out: ArchiveEntry[] = [];
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const entry of entries) {
    try {
      const content = await entry.async("string");
      out.push({ name: entry.name, content });
    } catch {
      // skip binary entries we can't decode as text
    }
  }
  return out;
}

/** Minimal POSIX-ustar tar reader; ignores long-name extensions for simplicity. */
function readTar(buf: Uint8Array): ArchiveEntry[] {
  const out: ArchiveEntry[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // end-of-archive
    const name = readString(header, 0, 100);
    const sizeOct = readString(header, 124, 12).replace(/[^0-7]/g, "");
    const typeFlag = String.fromCharCode(header[156] || 48);
    const size = sizeOct ? parseInt(sizeOct, 8) : 0;
    offset += 512;
    if (!name) { offset += roundUp(size); continue; }
    // Regular file types: '0', '\0'
    if (typeFlag === "0" || typeFlag === "\0") {
      const data = buf.subarray(offset, offset + size);
      try { out.push({ name, content: decoder.decode(data) }); } catch { /* skip */ }
    }
    offset += roundUp(size);
  }
  return out;
}

function readString(buf: Uint8Array, start: number, len: number): string {
  let end = start;
  while (end < start + len && buf[end] !== 0) end++;
  return new TextDecoder("utf-8", { fatal: false }).decode(buf.subarray(start, end)).trim();
}
function roundUp(n: number): number { return Math.ceil(n / 512) * 512; }
