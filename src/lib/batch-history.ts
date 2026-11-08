// Client-only persistence for recent batch jobs.
// Metadata in localStorage, ZIP blobs in IndexedDB (small wrapper).

export type BatchJobMeta = {
  id: string;
  createdAt: number;
  targetLang: string;
  sourceLang: string;
  fileCount: number;
  okCount: number;
  failedCount: number;
  zipSize: number;
  fileNames: string[];
};

const META_KEY = "subtitleos.batch.history.v1";
const DB_NAME = "subtitleos-batch";
const STORE = "zips";
const MAX_ENTRIES = 20;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, blob: Blob) {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

async function idbGet(key: string): Promise<Blob | null> {
  const db = await openDB();
  const blob = await new Promise<Blob | null>((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => res((req.result as Blob) ?? null);
    req.onerror = () => rej(req.error);
  });
  db.close();
  return blob;
}

async function idbDel(key: string) {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export function listBatchJobs(): BatchJobMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BatchJobMeta[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeList(list: BatchJobMeta[]) {
  localStorage.setItem(META_KEY, JSON.stringify(list));
}

export async function saveBatchJob(meta: Omit<BatchJobMeta, "id" | "createdAt">, zip: Blob): Promise<BatchJobMeta> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const full: BatchJobMeta = { id, createdAt: Date.now(), ...meta };
  await idbPut(id, zip);
  const list = [full, ...listBatchJobs()];
  // Prune oldest beyond MAX_ENTRIES
  while (list.length > MAX_ENTRIES) {
    const removed = list.pop()!;
    try { await idbDel(removed.id); } catch { /* ignore */ }
  }
  writeList(list);
  return full;
}

export async function getBatchZip(id: string): Promise<Blob | null> {
  return idbGet(id);
}

export async function deleteBatchJob(id: string) {
  try { await idbDel(id); } catch { /* ignore */ }
  writeList(listBatchJobs().filter((j) => j.id !== id));
}

export async function clearBatchJobs() {
  for (const j of listBatchJobs()) {
    try { await idbDel(j.id); } catch { /* ignore */ }
  }
  writeList([]);
}
