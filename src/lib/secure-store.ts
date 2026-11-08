// Encrypts small secret strings in the browser using a non-extractable
// AES-GCM key kept in IndexedDB. The key never leaves the browser and
// cannot be read from JS (extractable=false), so ciphertext in
// localStorage is not a plaintext leak.

const DB_NAME = "subtitleos-secure";
const STORE = "keys";
const KEY_ID = "aes-gcm-v1";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<CryptoKey | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, val: CryptoKey): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let cached: Promise<CryptoKey> | null = null;
async function getKey(): Promise<CryptoKey> {
  if (cached) return cached;
  cached = (async () => {
    const existing = await idbGet(KEY_ID);
    if (existing) return existing;
    const k = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // non-extractable
      ["encrypt", "decrypt"],
    );
    await idbPut(KEY_ID, k);
    return k;
  })();
  return cached;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptString(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plain);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource),
  );
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptString(payload: string): Promise<string> {
  if (!payload.startsWith("v1:")) return payload; // legacy plaintext
  const [, ivB64, ctB64] = payload.split(":");
  const key = await getKey();
  const iv = unb64(ivB64);
  const ct = unb64(ctB64);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

export function isEncrypted(payload: string | undefined | null): boolean {
  return !!payload && payload.startsWith("v1:");
}
