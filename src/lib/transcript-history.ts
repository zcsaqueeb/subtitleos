// Local-only transcript history. Stored in localStorage so it survives reloads
// without shipping user audio to the server. Keeps the last N entries.
export type TranscriptStatus = "running" | "paused" | "stopped" | "complete" | "error";

export type TranscriptEntry = {
  id: string;
  name: string;          // suggested file/output name
  sourceFileName?: string;
  sourceLang?: string;
  targetLang?: string;
  providerId?: string;
  status: TranscriptStatus;
  createdAt: number;     // ms
  updatedAt: number;     // ms
  durationSec?: number;
  chunks?: { done: number; total: number };
  srt: string;           // last known transcript (partial or final)
  error?: string;
};

const KEY = "sos.transcript.history.v1";
const MAX = 25;

function safeParse(raw: string | null): TranscriptEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

export function listHistory(): TranscriptEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(KEY)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveEntry(entry: TranscriptEntry): void {
  if (typeof window === "undefined") return;
  const all = safeParse(window.localStorage.getItem(KEY));
  const idx = all.findIndex((e) => e.id === entry.id);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  const trimmed = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // If quota is hit (huge SRTs), drop oldest and retry once.
    try {
      window.localStorage.setItem(KEY, JSON.stringify(trimmed.slice(0, Math.max(5, Math.floor(trimmed.length / 2)))));
    } catch { /* give up silently */ }
  }
}

export function deleteEntry(id: string): void {
  if (typeof window === "undefined") return;
  const all = safeParse(window.localStorage.getItem(KEY)).filter((e) => e.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
