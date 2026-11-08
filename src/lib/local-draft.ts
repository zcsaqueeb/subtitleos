import { useEffect, useRef, useState } from "react";

/** True when an error looks like it came from a dropped connection. */
export function isConnectionError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /failed to fetch|networkerror|network error|load failed|network request failed|connection (lost|reset|closed)|err_internet|offline|timed? ?out/i.test(msg);
}

export function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try { const v = window.localStorage.getItem(`sos.draft.${key}`); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
export function clearDraft(key: string) {
  try { window.localStorage.removeItem(`sos.draft.${key}`); } catch { /* ignore */ }
}

export function writeDraft<T>(key: string, value: T, at = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(`sos.draft.${key}`, JSON.stringify({ v: value, at }));
    return true;
  } catch { return false; }
}

/**
 * Restores a saved draft once after mount, then autosaves `value` (debounced).
 * Returns the timestamp of the last local save.
 */
export function useLocalDraft<T>(key: string, value: T, restore: (saved: T) => void, enabled = true) {
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);
  const latest = useRef({ value, enabled, ready });
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    const saved = readDraft<{ v: T; at: number }>(key);
    if (saved?.v) { restoreRef.current(saved.v); setSavedAt(saved.at); }
    setReady(true);
  }, [key]);
  const json = JSON.stringify(value);
  useEffect(() => { latest.current = { value, enabled, ready }; }, [value, enabled, ready]);
  useEffect(() => {
    if (!ready || !enabled) return;
    const t = window.setTimeout(() => {
      const at = Date.now();
      const saved = writeDraft(key, JSON.parse(json), at);
      setSaveError(!saved);
      if (saved) setSavedAt(at);
    }, 400);
    return () => window.clearTimeout(t);
  }, [json, ready, enabled, key]);
  useEffect(() => {
    const flush = () => {
      const current = latest.current;
      if (current.ready && current.enabled) writeDraft(key, current.value);
    };
    window.addEventListener("pagehide", flush);
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key]);
  return { ready, savedAt, saveError };
}
