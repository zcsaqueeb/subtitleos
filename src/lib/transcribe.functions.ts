import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dispatchTranscription } from "@/lib/transcription/dispatcher.server";
import { assertFeatureUnlocked } from "@/lib/feature-locks.server";

// Studio paid users get generous (but bounded) transcription throughput.
// Admins and active grants are unlimited. Free is blocked outright.
export const STUDIO_TRANSCRIBE_DAILY = 30;
export const STUDIO_TRANSCRIBE_MONTHLY = 900;

const TranscribeInput = z.object({
  fileName: z.string().min(1).max(200),
  mime: z.string().min(1).max(120),
  base64: z.string().min(16).max(35_000_000),
  durationSec: z.number().positive().max(60 * 60 * 12).optional(),
  language: z.string().min(2).max(10).optional(),
  providerId: z.string().min(1).max(40).optional(),
  apiKey: z.string().min(1).max(400).optional(),
  url: z.string().url().max(400).optional(),
  model: z.string().min(1).max(120).optional(),
  // Stable per-file id so chunked uploads count as ONE file toward quota.
  fileId: z.string().min(4).max(80).optional(),
  chunkIndex: z.number().int().min(0).max(10000).optional(),
});

type AccessTier = "blocked" | "studio" | "unlimited";

async function resolveTranscribeAccess(supabase: any, userId: string): Promise<{
  tier: AccessTier;
  reason?: string;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
}> {
  // Per-user admin override (highest priority — wins over plan/promo).
  const { data: override } = await supabase
    .from("transcribe_overrides")
    .select("unlimited, daily_limit, monthly_limit, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (override) {
    const active = !override.expires_at || new Date(override.expires_at).getTime() > Date.now();
    if (active) {
      if (override.unlimited) return { tier: "unlimited", reason: "override" };
      return {
        tier: "studio",
        reason: "override",
        dailyLimit: override.daily_limit ?? null,
        monthlyLimit: override.monthly_limit ?? null,
      };
    }
  }

  // Admin?
  const { data: adminRow } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (adminRow) return { tier: "unlimited", reason: "admin" };

  // Personal grant?
  const { data: profile } = await supabase
    .from("profiles").select("plan, unlimited_until").eq("id", userId).maybeSingle();
  const grantUntil = profile?.unlimited_until ? new Date(profile.unlimited_until).getTime() : 0;
  if (grantUntil > Date.now()) return { tier: "unlimited", reason: "grant" };

  // Global Studio promo (admin-controlled freebie window)?
  const { data: promo } = await supabase
    .from("app_settings").select("value").eq("key", "global_studio_promo").maybeSingle();
  const p = (promo?.value ?? null) as null | { active?: boolean; expiresAt?: string | null };
  if (p?.active) {
    const ok = !p.expiresAt || new Date(p.expiresAt).getTime() > Date.now();
    if (ok) return { tier: "studio", reason: "promo" };
  }

  const plan = profile?.plan ?? "indie";
  if (plan === "studio" || plan === "enterprise") return { tier: "studio" };
  return { tier: "blocked" };
}

export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => TranscribeInput.parse(data))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (auth) await assertFeatureUnlocked(auth.supabase, auth.userId, "transcribe");


    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 25 * 1024 * 1024) {
      throw new Error("Chunk too large (max ~25 MiB). Use client-side chunking for big files.");
    }

    // Gate.
    const access = auth
      ? await resolveTranscribeAccess(auth.supabase, auth.userId)
      : { tier: "unlimited" as const, reason: "guest" };

    // Quotas (Studio paid only — admins/grants/promo are unlimited).
    if (auth && access.tier === "studio") {
      const now = new Date();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

      const [{ count: dayCount }, { count: monthCount }] = await Promise.all([
        auth.supabase.from("transcription_usage").select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId).gte("created_at", dayStart),
        auth.supabase.from("transcription_usage").select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId).gte("created_at", monthStart),
      ]);

      const effectiveDaily = access.dailyLimit ?? STUDIO_TRANSCRIBE_DAILY;
      const effectiveMonthly = access.monthlyLimit ?? STUDIO_TRANSCRIBE_MONTHLY;
      // Only the FIRST chunk of a new file counts — same fileId is deduped via UNIQUE.
      const isFirstChunk = !data.chunkIndex || data.chunkIndex === 0;
      if (isFirstChunk) {
        if ((dayCount ?? 0) >= effectiveDaily) {
          throw new Error(`Daily transcription limit reached (${effectiveDaily}/day). Resets at 00:00 UTC.`);
        }
        if ((monthCount ?? 0) >= effectiveMonthly) {
          throw new Error(`Monthly transcription limit reached (${effectiveMonthly}/month).`);
        }
      }
    }

    const providerId = data.providerId || "openai";
    const res = await dispatchTranscription({
      providerId,
      apiKey: data.apiKey,
      url: data.url,
      model: data.model,
      language: data.language,
      fileName: data.fileName,
      mime: data.mime,
      bytes,
      durationSec: data.durationSec ?? Math.max(1, bytes.byteLength / (16000 * 2)),
    });

    // Record usage on first chunk only (dedup via UNIQUE on user_id+file_id).
    if (auth && access.tier === "studio" && data.fileId && (!data.chunkIndex || data.chunkIndex === 0)) {
      await auth.supabase
        .from("transcription_usage")
        .upsert(
          {
            user_id: auth.userId,
            file_id: data.fileId,
            file_name: data.fileName,
            duration_sec: data.durationSec ?? null,
            chunks: 1,
          },
          { onConflict: "user_id,file_id", ignoreDuplicates: true },
        );
    }

    return { srt: res.srt, text: res.text, language: data.language };
  });

// Lightweight usage probe for the transcribe page.
export const getTranscribeUsage = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return { allowed: true, unlimited: true, reason: "guest", usedToday: 0, usedMonth: 0, dailyLimit: null, monthlyLimit: null };
    const { supabase, userId } = auth;
    const access = await resolveTranscribeAccess(supabase, userId);

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const [{ count: dayCount }, { count: monthCount }] = await Promise.all([
      supabase.from("transcription_usage").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("created_at", dayStart),
      supabase.from("transcription_usage").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("created_at", monthStart),
    ]);

    const unlimited = access.tier === "unlimited";
    const allowed = access.tier !== "blocked";
    return {
      allowed,
      unlimited,
      reason: access.reason ?? null,
      usedToday: dayCount ?? 0,
      usedMonth: monthCount ?? 0,
      dailyLimit: unlimited ? null : (access.dailyLimit ?? STUDIO_TRANSCRIBE_DAILY),
      monthlyLimit: unlimited ? null : (access.monthlyLimit ?? STUDIO_TRANSCRIBE_MONTHLY),
    };
  });
