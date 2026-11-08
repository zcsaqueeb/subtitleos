import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EntrySchema = z.object({
  term: z.string().min(1).max(200),
  translation: z.string().min(1).max(400),
  caseSensitive: z.boolean().optional(),
  note: z.string().max(300).optional(),
});

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  sourceLang: z.string().max(10).optional().nullable(),
  targetLang: z.string().max(10).optional().nullable(),
  entries: z.array(EntrySchema).max(500),
  isDefault: z.boolean().optional(),
});

export const listGlossaries = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return { items: [], hasStudio: true } as const;
    const { supabase, userId } = auth as { supabase: any; userId: string };
    const { data, error } = await supabase
      .from("glossaries")
      .select("id, name, source_lang, target_lang, entries, is_default, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [], hasStudio: true } as const;
  });

export const upsertGlossary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpsertInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { assertStudio } = await import("@/lib/entitlements.server");
    await assertStudio({ supabase, userId });

    if (data.isDefault) {
      await supabase.from("glossaries").update({ is_default: false }).eq("user_id", userId);
    }

    if (data.id) {
      const { data: row, error } = await supabase
        .from("glossaries")
        .update({
          name: data.name,
          source_lang: data.sourceLang ?? null,
          target_lang: data.targetLang ?? null,
          entries: data.entries,
          is_default: !!data.isDefault,
        })
        .eq("id", data.id)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
    const { data: row, error } = await supabase
      .from("glossaries")
      .insert({
        user_id: userId,
        name: data.name,
        source_lang: data.sourceLang ?? null,
        target_lang: data.targetLang ?? null,
        entries: data.entries,
        is_default: !!data.isDefault,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteGlossary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { error } = await supabase
      .from("glossaries").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
