import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ChunkInput = z.object({
  sourceLang: z.string().min(2).max(10),
  targetLang: z.string().min(2).max(10),
  cues: z.array(z.string().max(4000)).min(1).max(20),
  providerId: z.string().min(1).max(40).optional(),
  apiKey: z.string().min(1).max(400).optional(),
  url: z.string().url().max(400).optional(),
  model: z.string().min(1).max(120).optional(),
  region: z.string().min(1).max(40).optional(),
  apiVersion: z.string().min(1).max(40).optional(),
  folderId: z.string().min(1).max(80).optional(),
  temperature: z.number().min(0).max(2).optional(),
  // Studio
  glossaryId: z.string().uuid().optional(),
  priority: z.boolean().optional(),
  stylePreset: z.enum(["default","netflix","anime","disney","literal","natural","dub"]).optional(),
  proPolish: z.boolean().optional(),
});

/** Translate a small batch of cues. No DB writes — used for live streaming UI. */
export const translateCuesChunk = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ChunkInput.parse(input))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    const providerId = data.providerId || "gtxFreeAPI";

    const { dispatch } = await import("@/lib/translation/dispatcher.server");
    if (data.url) {
      const { assertSafeExternalUrl } = await import("@/lib/url-guard.server");
      assertSafeExternalUrl(data.url);
    }

    // Studio-only options. Silently ignore if the user isn't on Studio.
    let glossary: Array<{ term: string; translation: string; caseSensitive?: boolean }> | undefined;
    let priority = false;
    if (auth && (data.priority || data.glossaryId)) {
      const { getEntitlements } = await import("@/lib/entitlements.server");
      const ent = await getEntitlements({ supabase: auth.supabase, userId: auth.userId });
      if (ent.hasStudio) {
        priority = !!data.priority;
        if (data.glossaryId) {
          const { data: g } = await auth.supabase
            .from("glossaries")
            .select("entries")
            .eq("id", data.glossaryId)
            .eq("user_id", auth.userId)
            .maybeSingle();
          if (g?.entries && Array.isArray(g.entries)) glossary = g.entries as typeof glossary;
        }
      }
    }

    // Translation Memory: skip cues we've already translated for this user + lang pair.
    const { lookupTM, saveTM, bumpTMHits } = await import("@/lib/translation-memory.server");
    const tm = auth
      ? await lookupTM({
          supabase: auth.supabase, userId: auth.userId,
          sourceLang: data.sourceLang, targetLang: data.targetLang,
          cues: data.cues,
        })
      : {
          cached: new Map<number, string>(),
          uncachedIndexes: data.cues.map((_, index) => index),
          uncachedCues: data.cues,
          hashes: [] as string[],
        };

    let fresh: string[] = [];
    if (tm.uncachedCues.length > 0) {
      fresh = await dispatch({
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
        proPolish: data.proPolish ?? priority,
      });
    }

    // Stitch results back into original order.
    let translations: string[] = new Array(data.cues.length).fill("");
    for (const [i, v] of tm.cached.entries()) translations[i] = v;
    for (let k = 0; k < tm.uncachedIndexes.length; k++) {
      translations[tm.uncachedIndexes[k]] = fresh[k] ?? data.cues[tm.uncachedIndexes[k]];
    }

    // Persist new TM entries + bump reused ones (fire-and-forget).
    const newPairs: Array<{ source: string; target: string }> = [];
    for (let k = 0; k < tm.uncachedIndexes.length; k++) {
      newPairs.push({ source: tm.uncachedCues[k], target: fresh[k] ?? "" });
    }
    if (auth) void saveTM({ supabase: auth.supabase, userId: auth.userId, sourceLang: data.sourceLang, targetLang: data.targetLang, pairs: newPairs });
    if (auth && tm.cached.size > 0) {
      const hits = Array.from(tm.cached.keys()).map((i) => tm.hashes[i]).filter(Boolean);
      void bumpTMHits({ supabase: auth.supabase, userId: auth.userId, sourceLang: data.sourceLang, targetLang: data.targetLang, hashes: hits });
    }
    // Pad / trim defensively so the UI never desyncs from the cue stream.
    if (translations.length < data.cues.length) {
      translations = [
        ...translations,
        ...data.cues.slice(translations.length).map((c) => c),
      ];
    } else if (translations.length > data.cues.length) {
      translations = translations.slice(0, data.cues.length);
    }
    return { translations };
  });

const SaveInput = z.object({
  fileName: z.string().min(1).max(200),
  sourceLang: z.string().min(2).max(10),
  targetLang: z.string().min(2).max(10),
  sourceText: z.string().min(1).max(400_000),
  translatedText: z.string().min(1).max(800_000),
  durationMs: z.number().int().nonnegative().max(3_600_000),
});

export const saveTranslation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return { id: `guest-${Date.now()}` };
    const { supabase, userId } = auth;
    const { data: row, error } = await supabase
      .from("translations")
      .insert({

        user_id: userId,
        file_name: data.fileName,
        source_lang: data.sourceLang,
        target_lang: data.targetLang,
        source_text: data.sourceText,
        translated_text: data.translatedText,
        status: "completed",
        char_count: data.sourceText.length,
        duration_ms: data.durationMs,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to save translation");
    return { id: row.id };
  });
