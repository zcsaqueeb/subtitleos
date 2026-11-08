import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCurrentUserContext = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) {
      return { userId: "", profile: null, roles: [] as string[], lastSignInAt: null as string | null };
    }
    const { supabase, userId } = auth;

    const [profileRes, rolesRes, userRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.auth.getUser(),
    ]);

    return {
      userId,
      profile: profileRes.data,
      roles: (rolesRes.data ?? []).map((r) => r.role) as string[],
      lastSignInAt: userRes.data.user?.last_sign_in_at ?? null,
    };
  });


const UpdateProfileInput = z.object({
  display_name: z.string().trim().min(1).max(80).optional(),
  hide_email: z.boolean().optional(),
  avatar_url: z.string().trim().max(2000).nullable().optional(),
  mark_studio_onboarded: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      display_name?: string;
      hide_email?: boolean;
      avatar_url?: string | null;
      studio_onboarded_at?: string;
    } = {};
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.hide_email !== undefined) patch.hide_email = data.hide_email;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    if (data.mark_studio_onboarded) patch.studio_onboarded_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const VALID_THEMES = [
  "default", "midnight-indigo", "emerald-prestige", "sunset-blaze",
  "neon-mint", "noir-gold", "ocean-deep",
  "rose-quartz", "cyber-violet", "arctic-frost", "forest-moss",
  "paper-ink", "vapor-chrome", "autumn-harvest", "custom",
] as const;

export const updateMyTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ theme: z.enum(VALID_THEMES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ theme: data.theme })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, theme: data.theme };
  });

export const getMyTheme = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return { theme: "default" };
    const { supabase, userId } = auth;
    const { data } = await supabase
      .from("profiles")
      .select("theme")
      .eq("id", userId)
      .maybeSingle();
    return { theme: (data?.theme ?? "default") as string };
  });

const SignedAvatarInput = z.object({
  path: z.string().min(1).max(500),
  expiresIn: z.number().int().min(60).max(60 * 60 * 24 * 365).optional(),
});

/** Mint a signed URL for an avatar in the private `avatars` bucket. */
export const signAvatarUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignedAvatarInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Only allow signing your own avatar path.
    if (!data.path.startsWith(`${userId}/`)) throw new Error("Forbidden");
    const { data: signed, error } = await supabase.storage
      .from("avatars")
      .createSignedUrl(data.path, data.expiresIn ?? 60 * 60 * 24 * 365);
    if (error || !signed) throw new Error(error?.message ?? "Failed to sign URL");
    return { url: signed.signedUrl };
  });
