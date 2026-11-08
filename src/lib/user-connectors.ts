// Client-side helpers for a user's own connector API keys (BYOK).
// These are stored in localStorage on the user's browser and sent per request
// to the server so it can prefer the user's key over the admin/env-provided one.

const ELEVENLABS_KEY = "subtitleos.userConnector.elevenlabs.v1";
const SYNC_SO_KEY = "subtitleos.userConnector.syncSo.v1";

function getKey(storageKey: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(storageKey);
    return value?.trim() || undefined;
  } catch { return undefined; }
}

function setKey(storageKey: string, key: string | null, id: string) {
  if (typeof window === "undefined") return;
  try {
    if (!key?.trim()) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, key.trim());
    window.dispatchEvent(new CustomEvent("user-connector-changed", { detail: { id } }));
  } catch { /* Browser storage may be disabled. */ }
}

export function getUserElevenLabsKey(): string | undefined {
  return getKey(ELEVENLABS_KEY);
}

export function setUserElevenLabsKey(key: string | null) {
  setKey(ELEVENLABS_KEY, key, "elevenlabs");
}

export function hasUserElevenLabsKey(): boolean {
  return !!getUserElevenLabsKey();
}

export function getUserSyncSoKey(): string | undefined {
  return getKey(SYNC_SO_KEY);
}

export function setUserSyncSoKey(key: string | null) {
  setKey(SYNC_SO_KEY, key, "sync-so");
}
