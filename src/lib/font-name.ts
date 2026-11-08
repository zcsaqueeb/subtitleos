// Minimal TTF/OTF `name` table reader — extracts the internal font family name
// so libass (which matches by family, not filename) can find an uploaded font.

function readName(view: DataView, tableOffset: number): string | null {
  const count = view.getUint16(tableOffset + 2);
  const stringOffset = view.getUint16(tableOffset + 4);
  let fallback: string | null = null;
  for (let i = 0; i < count; i++) {
    const rec = tableOffset + 6 + i * 12;
    const platformId = view.getUint16(rec);
    const encodingId = view.getUint16(rec + 2);
    const nameId = view.getUint16(rec + 6);
    const length = view.getUint16(rec + 8);
    const offset = view.getUint16(rec + 10);
    if (nameId !== 1 && nameId !== 16) continue;
    const start = tableOffset + stringOffset + offset;
    if (start + length > view.byteLength) continue;
    const bytes = new Uint8Array(view.buffer, view.byteOffset + start, length);
    const utf16 = platformId === 0 || platformId === 3 || encodingId === 1;
    let str = "";
    if (utf16) {
      for (let j = 0; j + 1 < bytes.length; j += 2) str += String.fromCharCode((bytes[j] << 8) | bytes[j + 1]);
    } else {
      str = String.fromCharCode(...bytes);
    }
    str = str.replace(/\u0000/g, "").trim();
    if (!str) continue;
    if (nameId === 16) return str; // typographic family wins
    fallback = fallback ?? str;
  }
  return fallback;
}

/** Returns the font's family name, or null if it can't be parsed. */
export function parseFontFamily(buffer: ArrayBuffer): string | null {
  try {
    const view = new DataView(buffer);
    let base = 0;
    if (view.getUint32(0) === 0x74746366 /* 'ttcf' */) base = view.getUint32(12);
    const numTables = view.getUint16(base + 4);
    for (let i = 0; i < numTables; i++) {
      const rec = base + 12 + i * 16;
      const tag = String.fromCharCode(
        view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3),
      );
      if (tag === "name") return readName(view, view.getUint32(rec + 8));
    }
  } catch {
    // fall through
  }
  return null;
}
