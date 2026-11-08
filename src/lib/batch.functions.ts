import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFeatureUnlocked } from "@/lib/feature-locks.server";

/**
 * Server-side gate for Batch ZIP translation. Throws (HTTP 402) for free users
 * so the feature can't be invoked even if the UI is bypassed.
 */
export const assertBatchAccess = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return { ok: true as const };
    const { supabase, userId } = auth as unknown as { supabase: any; userId: string };
    await assertFeatureUnlocked(supabase, userId, "batch_translate");
    const { assertStudio } = await import("@/lib/entitlements.server");
    await assertStudio({ supabase, userId });
    return { ok: true as const };
  });
