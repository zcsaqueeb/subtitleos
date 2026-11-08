import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TranslateInput = z.object({
  fileName: z.string().min(1).max(200),
  sourceLang: z.string().min(2).max(10),
  targetLang: z.string().min(2).max(10),
  content: z.string().min(1).max(200_000),
  // Optional provider overrides (UI passes these from the Provider settings panel)
  providerId: z.string().min(1).max(40).optional(),
  apiKey: z.string().min(1).max(400).optional(),
  url: z.string().url().max(400).optional(),
  model: z.string().min(1).max(120).optional(),
  region: z.string().min(1).max(40).optional(),
  apiVersion: z.string().min(1).max(40).optional(),
  folderId: z.string().min(1).max(80).optional(),
  temperature: z.number().min(0).max(2).optional(),
  batch: z.boolean().optional(),
  // Studio extras (also respected in Batch ZIP now)
  glossaryId: z.string().uuid().optional(),
  priority: z.boolean().optional(),
  useTM: z.boolean().optional(), // default true
  // Style preset for the model prompt.
  stylePreset: z.enum(["default","netflix","anime","disney","literal","natural","dub"]).optional(),
});


/** Split an SRT/VTT into cue blocks and extract translatable text per block. */
function splitSrt(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split("\n");
    let textStart = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/-->/.test(lines[i])) { textStart = i + 1; break; }
    }
    return {
      header: lines.slice(0, textStart).join("\n"),
      text: lines.slice(textStart).join("\n"),
    };
  });
}

function joinSrt(blocks: { header: string; text: string }[]) {
  return blocks.map((b) => (b.header ? `${b.header}\n${b.text}` : b.text)).join("\n\n");
}

export const translateSubtitles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TranslateInput.parse(input))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    const started = Date.now();
    const providerId = data.providerId || "gtxFreeAPI";

    // Guests can translate without an account. Account-only persistence and
    // translation memory are skipped, while the same provider pipeline runs.
    if (!auth) {
      const blocks = splitSrt(data.content);
      const { dispatch } = await import("@/lib/translation/dispatcher.server");
      if (data.url) {
        const { assertSafeExternalUrl } = await import("@/lib/url-guard.server");
        assertSafeExternalUrl(data.url);
      }
      const translations = await dispatch({
        providerId,
        sourceLang: data.sourceLang,
        targetLang: data.targetLang,
        cues: blocks.map((block) => block.text),
        apiKey: data.apiKey,
        url: data.url,
        model: data.model,
        region: data.region,
        apiVersion: data.apiVersion,
        folderId: data.folderId,
        temperature: data.temperature,
        stylePreset: data.stylePreset,
        priority: data.priority,
        proPolish: data.priority,
      });
      return {
        id: `guest-${started}`,
        translatedText: joinSrt(blocks.map((block, index) => ({
          header: block.header,
          text: translations[index] ?? block.text,
        }))),
        providerId,
      };
    }

    const { supabase, userId } = auth;

    const { assertCanTranslate, assertStudio, assertProviderAllowed } = await import("@/lib/entitlements.server");
    if (data.batch) await assertStudio({ supabase, userId });
    await assertProviderAllowed({ supabase, userId, providerId });
    await assertCanTranslate({ supabase, userId, targetLang: data.targetLang });




    const { data: row, error: insertErr } = await supabase
      .from("translations")
      .insert({
        user_id: userId,
        file_name: data.fileName,
        source_lang: data.sourceLang,
        target_lang: data.targetLang,
        source_text: data.content,
        status: "processing",
        char_count: data.content.length,
      })
      .select("id")
      .single();
    if (insertErr || !row) throw new Error(insertErr?.message ?? "Failed to create translation");

    try {
      const blocks = splitSrt(data.content);
      const cues = blocks.map((b) => b.text);

      // ---- Translation Memory: reuse previously translated cues. ----
      const { lookupTM, saveTM, bumpTMHits } = await import("@/lib/translation-memory.server");
      const useTM = data.useTM !== false;
      const tm = useTM
        ? await lookupTM({ supabase, userId, sourceLang: data.sourceLang, targetLang: data.targetLang, cues })
        : { cached: new Map<number, string>(), uncachedIndexes: cues.map((_, i) => i), uncachedCues: cues, hashes: [] as string[] };

      // ---- Studio extras (glossary + priority). Silently ignored for non-Studio. ----
      let glossary: Array<{ term: string; translation: string; caseSensitive?: boolean }> | undefined;
      let priority = false;
      if (data.glossaryId || data.priority) {
        const { getEntitlements } = await import("@/lib/entitlements.server");
        const ent = await getEntitlements({ supabase, userId });
        if (ent.hasStudio) {
          priority = !!data.priority;
          if (data.glossaryId) {
            const { data: g } = await supabase
              .from("glossaries").select("entries")
              .eq("id", data.glossaryId).eq("user_id", userId).maybeSingle();
            if (g?.entries && Array.isArray(g.entries)) glossary = g.entries as typeof glossary;
          }
        }
      }

      const { dispatch } = await import("@/lib/translation/dispatcher.server");
      if (data.url) {
        const { assertSafeExternalUrl } = await import("@/lib/url-guard.server");
        try {
          assertSafeExternalUrl(data.url);
        } catch (e) {
          const localProviders = new Set([
            "translategemma", "lmstudio", "ollama", "llamacpp", "litellm", "llm",
          ]);
          if (localProviders.has(providerId)) {
            throw new Error(
              `${providerId} runs on your own machine (e.g. http://127.0.0.1). It cannot be reached from the SubtitleOS server. Please pick a hosted provider, or run SubtitleOS locally to use this provider.`,
            );
          }
          throw e;
        }
      }

      let freshlyTranslated: string[] = [];
      if (tm.uncachedCues.length > 0) {
        freshlyTranslated = await dispatch({
          providerId,
          sourceLang: data.sourceLang,
          targetLang: data.targetLang,
          cues: tm.uncachedCues,
          apiKey: data.apiKey,
          url: data.url,
          model: data.model,
          region: data.region,
          apiVersion: data.apiVersion,
          folderId: data.folderId,
          temperature: data.temperature,
          glossary,
          priority,
          stylePreset: data.stylePreset,
          proPolish: priority,
        });
        if (freshlyTranslated.length !== tm.uncachedCues.length) {
          throw new Error(`Model returned ${freshlyTranslated.length} cues but expected ${tm.uncachedCues.length}`);
        }
      }

      // Stitch cached + fresh back together in original cue order.
      const translations: string[] = new Array(cues.length).fill("");
      for (const [i, v] of tm.cached.entries()) translations[i] = v;
      for (let k = 0; k < tm.uncachedIndexes.length; k++) {
        translations[tm.uncachedIndexes[k]] = freshlyTranslated[k] ?? cues[tm.uncachedIndexes[k]];
      }

      // Persist new TM entries + bump LRU on reused ones (fire-and-forget).
      if (useTM) {
        const newPairs: Array<{ source: string; target: string }> = [];
        for (let k = 0; k < tm.uncachedIndexes.length; k++) {
          newPairs.push({ source: tm.uncachedCues[k], target: freshlyTranslated[k] ?? "" });
        }
        void saveTM({ supabase, userId, sourceLang: data.sourceLang, targetLang: data.targetLang, pairs: newPairs });
        if (tm.cached.size > 0) {
          const hits = Array.from(tm.cached.keys()).map((i) => tm.hashes[i]).filter(Boolean);
          void bumpTMHits({ supabase, userId, sourceLang: data.sourceLang, targetLang: data.targetLang, hashes: hits });
        }
      }

      const output = joinSrt(blocks.map((b, i) => ({ header: b.header, text: translations[i] ?? b.text })));

      await supabase
        .from("translations")
        .update({
          translated_text: output,
          status: "completed",
          duration_ms: Date.now() - started,
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      return { id: row.id, translatedText: output, providerId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await supabase
        .from("translations")
        .update({ status: "failed", error_message: message, duration_ms: Date.now() - started })
        .eq("id", row.id);
      throw new Error(message);
    }
  });

export const listMyTranslations = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return [];
    const { supabase, userId } = auth;
    const { data, error } = await supabase
      .from("translations")
      .select("id, file_name, source_lang, target_lang, status, char_count, duration_ms, created_at, completed_at, error_message")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getTranslation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.from("translations").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("translations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PolishInput = z.object({
  srt: z.string().min(1).max(400_000),
  targetLang: z.string().min(2).max(10),
  // Honour the user's chosen translation provider for the cleanup pass.
  providerId: z.string().max(40).optional(),
  apiKey: z.string().max(400).optional(),
  url: z.string().max(500).optional(),
  model: z.string().max(120).optional(),
  apiVersion: z.string().max(40).optional(),
  /** Mixed-language audio: keep each cue in its own original language. */
  multiLang: z.boolean().optional(),
});

/**
 * Proofread / polish an already-translated SRT.
 * Fixes ONLY: bad translations, literal MT phrases, grammar, awkward wording,
 * spelling, punctuation, name/term/pronoun/honorific consistency, line length.
 * Preserves: meaning, numbering, timestamps, formatting.
 */
export const polishSrt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PolishInput.parse(input))
  .handler(async ({ data }) => {
    const { chatJsonArray } = await import("./translation/dispatcher.server");

    const blocks = splitSrt(data.srt);
    const cues = blocks.map((b) => b.text);

    // Chunk to keep within model limits — same strategy as translation dispatcher.
    const CHUNK_COUNT = 25;
    const CHUNK_CHARS = 6000;
    const chunks: string[][] = [];
    let cur: string[] = [];
    let curChars = 0;
    for (const c of cues) {
      if (cur.length >= CHUNK_COUNT || curChars + c.length > CHUNK_CHARS) {
        if (cur.length) chunks.push(cur);
        cur = []; curChars = 0;
      }
      cur.push(c); curChars += c.length;
    }
    if (cur.length) chunks.push(cur);

    const multi = data.multiLang === true;
    const system = [
      multi
        ? `You are a professional subtitle editor working on MIXED-LANGUAGE audio.`
        : `You are a professional subtitle editor and localizer working in ${data.targetLang}.`,
      multi
        ? `Each cue may be in a DIFFERENT language. Keep every cue in its ORIGINAL spoken language and native script — never translate a cue into another language, never romanize, never unify languages.`
        : `Translate/refine each cue naturally while PRESERVING the original meaning, tone, emotion, register, and context.`,
      `Fix ONLY these issues in each cue:`,
      `- Incorrect or misheard transcription / mistranslated lines`,
      multi
        ? `- Literal or garbled phrasing → idiomatic phrasing in that cue's own language`
        : `- Literal / machine-translated phrasing → idiomatic ${data.targetLang}`,
      `- Grammar, spelling, and punctuation errors`,
      `- Unnatural or awkward wording`,
      `- Inconsistent names, terminology, pronouns, and honorifics across cues`,
      `- Capitalization and subtitle readability (max ~42 chars/line, max 2 lines)`,
      ``,
      `STRICT RULES:`,
      `- Do NOT summarize, add, remove, merge, split, or censor dialogue (keep profanity/slang/sensitive content intact).`,
      `- Do NOT change meaning, intent, or speaker voice.`,
      `- Preserve subtitle order and count EXACTLY — one output cue per input cue, same index.`,
      `- Preserve formatting markers (<i>, <b>, line breaks, music notes ♪, ellipses…) as-is.`,
      `- You do NOT receive numbering or timestamps; never invent or output them.`,
      `Return JSON: {"cues": string[]} with EXACTLY the same number of items as the input, in the same order. Each item is the corrected cue text only.`,
    ].join("\n");

    const cfg = {
      providerId: data.providerId,
      apiKey: data.apiKey,
      url: data.url,
      model: data.model,
      apiVersion: data.apiVersion,
    };

    const out: string[] = [];
    for (const slice of chunks) {
      let arr: string[] = [];
      try {
        arr = await chatJsonArray(cfg, system, JSON.stringify({ cues: slice }), "cues");
      } catch (err) {
        // Never lose the transcript because one chunk failed — keep originals.
        if (!out.length && chunks.length === 1) throw err;
        arr = [];
      }
      // Defensive: pad/trim to match input length so SRT alignment is preserved.
      for (let i = 0; i < slice.length; i++) {
        const v = arr[i];
        out.push(typeof v === "string" && v.trim() ? v : slice[i]);
      }
    }


    if (out.length !== blocks.length) {
      // Should be impossible due to padding, but guard anyway.
      while (out.length < blocks.length) out.push(blocks[out.length].text);
    }

    const polished = joinSrt(blocks.map((b, i) => ({ header: b.header, text: out[i] })));
    return { polishedSrt: polished, cueCount: blocks.length };
  });

const RetranslateInput = z.object({
  srt: z.string().min(1).max(400_000),
  indexes: z.array(z.number().int().nonnegative()).min(1).max(500),
  sourceLang: z.string().min(2).max(10),
  targetLang: z.string().min(2).max(10),
  providerId: z.string().min(1).max(40).optional(),
  apiKey: z.string().min(1).max(400).optional(),
  url: z.string().url().max(400).optional(),
  model: z.string().min(1).max(120).optional(),
  region: z.string().min(1).max(40).optional(),
  apiVersion: z.string().min(1).max(40).optional(),
  folderId: z.string().min(1).max(80).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stylePreset: z.enum(["default","netflix","anime","disney","literal","natural","dub"]).optional(),
  glossaryId: z.string().uuid().optional(),
  priority: z.boolean().optional(),
});

/**
 * Re-translate only the selected cue indexes in an existing SRT and splice
 * the new lines back into the original document. Timestamps preserved.
 */
export const retranslateCues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RetranslateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { assertCanTranslate, assertProviderAllowed } = await import("@/lib/entitlements.server");
    await assertProviderAllowed({ supabase, userId, providerId: data.providerId || "gtxFreeAPI" });
    await assertCanTranslate({ supabase, userId, targetLang: data.targetLang });

    const blocks = splitSrt(data.srt);
    const cues = blocks.map((b) => b.text);
    const picks = Array.from(new Set(data.indexes.filter((i) => i >= 0 && i < cues.length))).sort((a, b) => a - b);
    if (!picks.length) return { srt: data.srt, count: 0 };
    const selected = picks.map((i) => cues[i]);

    // Studio glossary/priority (silently ignored for non-Studio).
    let glossary: Array<{ term: string; translation: string; caseSensitive?: boolean }> | undefined;
    let priority = false;
    if (data.glossaryId || data.priority) {
      const { getEntitlements } = await import("@/lib/entitlements.server");
      const ent = await getEntitlements({ supabase, userId });
      if (ent.hasStudio) {
        priority = !!data.priority;
        if (data.glossaryId) {
          const { data: g } = await supabase
            .from("glossaries").select("entries")
            .eq("id", data.glossaryId).eq("user_id", userId).maybeSingle();
          if (g?.entries && Array.isArray(g.entries)) glossary = g.entries as typeof glossary;
        }
      }
    }

    if (data.url) {
      const { assertSafeExternalUrl } = await import("@/lib/url-guard.server");
      assertSafeExternalUrl(data.url);
    }

    // Scene context = up to 3 cues before the first pick and after the last pick.
    const CTX = 3;
    const firstIdx = picks[0];
    const lastIdx = picks[picks.length - 1];
    const contextBefore = cues.slice(Math.max(0, firstIdx - CTX), firstIdx);
    const contextAfter = cues.slice(lastIdx + 1, lastIdx + 1 + CTX);

    const { dispatch } = await import("@/lib/translation/dispatcher.server");
    const out = await dispatch({
      providerId: data.providerId || "gtxFreeAPI",
      sourceLang: data.sourceLang,
      targetLang: data.targetLang,
      cues: selected,
      apiKey: data.apiKey,
      url: data.url,
      model: data.model,
      region: data.region,
      apiVersion: data.apiVersion,
      folderId: data.folderId,
      temperature: data.temperature,
      stylePreset: data.stylePreset,
      glossary,
      priority,
      proPolish: priority,
      contextBefore,
      contextAfter,
    });

    const next = blocks.slice();
    for (let k = 0; k < picks.length; k++) {
      const idx = picks[k];
      next[idx] = { header: blocks[idx].header, text: out[k] ?? blocks[idx].text };
    }
    return { srt: joinSrt(next), count: picks.length };
  });

