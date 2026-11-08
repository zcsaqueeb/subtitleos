/**
 * Translation Memory helpers.
 * Reuse previously translated subtitle cues per user/language pair to:
 *  - speed up repeat translations
 *  - keep terminology consistent across files
 *
 * Matching is exact on a normalized form of the source text (trim + collapse
 * whitespace). Each cue is hashed (sha256) for cheap indexed lookup.
 */
import { createHash } from "crypto";

type AnyClient = { from: (table: string) => any };

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function hashCue(text: string): string {
  return createHash("sha256").update(normalize(text)).digest("hex");
}

export type TMLookup = {
  cached: Map<number, string>; // index → cached translation
  uncachedIndexes: number[];
  uncachedCues: string[];
  hashes: string[]; // hash for each input cue, parallel array
};

export async function lookupTM(args: {
  supabase: AnyClient;
  userId: string;
  sourceLang: string;
  targetLang: string;
  cues: string[];
}): Promise<TMLookup> {
  const { supabase, userId, sourceLang, targetLang, cues } = args;
  const hashes = cues.map(hashCue);
  const cached = new Map<number, string>();
  const uncachedIndexes: number[] = [];
  const uncachedCues: string[] = [];

  if (cues.length === 0) {
    return { cached, uncachedIndexes, uncachedCues, hashes };
  }

  try {
    const uniqueHashes = Array.from(new Set(hashes.filter((h) => !!h)));
    const { data } = await supabase
      .from("translation_memory")
      .select("source_hash, target_text")
      .eq("user_id", userId)
      .eq("source_lang", sourceLang)
      .eq("target_lang", targetLang)
      .in("source_hash", uniqueHashes);

    const byHash = new Map<string, string>();
    for (const r of (data ?? []) as Array<{ source_hash: string; target_text: string }>) {
      byHash.set(r.source_hash, r.target_text);
    }

    for (let i = 0; i < cues.length; i++) {
      const hit = byHash.get(hashes[i]);
      // Skip empty/whitespace-only cues — never put them in TM.
      if (hit !== undefined && normalize(cues[i]).length > 0) {
        cached.set(i, hit);
      } else {
        uncachedIndexes.push(i);
        uncachedCues.push(cues[i]);
      }
    }
  } catch {
    // On any TM lookup error, fall back to translating everything.
    for (let i = 0; i < cues.length; i++) {
      uncachedIndexes.push(i);
      uncachedCues.push(cues[i]);
    }
  }

  return { cached, uncachedIndexes, uncachedCues, hashes };
}

/** Bump hits when a cached entry is reused. Fire-and-forget. */
export async function bumpTMHits(args: {
  supabase: AnyClient;
  userId: string;
  sourceLang: string;
  targetLang: string;
  hashes: string[];
}): Promise<void> {
  if (args.hashes.length === 0) return;
  try {
    // Best-effort batched bump. No exact "increment" via PostgREST without an
    // RPC, so we just touch updated_at to keep LRU-style ordering.
    await args.supabase
      .from("translation_memory")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", args.userId)
      .eq("source_lang", args.sourceLang)
      .eq("target_lang", args.targetLang)
      .in("source_hash", args.hashes);
  } catch {
    /* ignore */
  }
}

/** Save newly translated cues into TM. Skips empty pairs and identical pairs. */
export async function saveTM(args: {
  supabase: AnyClient;
  userId: string;
  sourceLang: string;
  targetLang: string;
  pairs: Array<{ source: string; target: string }>;
}): Promise<void> {
  const rows: Array<{
    user_id: string;
    source_lang: string;
    target_lang: string;
    source_hash: string;
    source_text: string;
    target_text: string;
  }> = [];
  const seen = new Set<string>();
  for (const p of args.pairs) {
    const src = normalize(p.source);
    const tgt = (p.target ?? "").trim();
    if (!src || !tgt) continue;
    if (src === tgt) continue; // don't memorize untranslated passthroughs
    if (src.length > 4000 || tgt.length > 4000) continue;
    const h = hashCue(p.source);
    if (seen.has(h)) continue;
    seen.add(h);
    rows.push({
      user_id: args.userId,
      source_lang: args.sourceLang,
      target_lang: args.targetLang,
      source_hash: h,
      source_text: src,
      target_text: tgt,
    });
  }
  if (rows.length === 0) return;
  try {
    await args.supabase
      .from("translation_memory")
      .upsert(rows, { onConflict: "user_id,source_lang,target_lang,source_hash" });
  } catch {
    /* ignore — TM is best-effort */
  }
}
