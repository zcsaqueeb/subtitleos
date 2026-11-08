import { createServerFn } from "@tanstack/react-start";

export const FREE_MONTHLY_LIMIT = 30;
export const FREE_DAILY_LIMIT = 3;

const GUEST_USAGE = {
  plan: "enterprise" as const,
  used: 0,
  limit: null as number | null,
  remaining: null as number | null,
  usedToday: 0,
  dailyLimit: null as number | null,
  remainingToday: null as number | null,
  exhausted: false,
  unlimited: true,
  nextReset: null as string | null,
  nextDailyReset: null as string | null,
  isAdmin: false,
  unlimitedUntil: null as string | null,
  promoActive: false,
  promoExpiresAt: null as string | null,
  promoMessage: "",
};

export const getMonthlyUsage = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return GUEST_USAGE;
    const { supabase, userId } = auth as { supabase: any; userId: string };

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, unlimited_until")
      .eq("id", userId)
      .maybeSingle();

    let plan = (profile?.plan ?? "indie") as "indie" | "studio" | "enterprise";

    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRow) plan = "enterprise";

    const grantedUntil = profile?.unlimited_until ? new Date(profile.unlimited_until) : null;
    const grantedUnlimited = !!grantedUntil && grantedUntil.getTime() > Date.now();
    if (grantedUnlimited) plan = "enterprise";

    // Global Studio promo — admin-controlled "free for everyone" window.
    const { data: promoRow } = await supabase
      .from("app_settings").select("value").eq("key", "global_studio_promo").maybeSingle();
    const promo = (promoRow?.value ?? null) as null | { active?: boolean; expiresAt?: string | null; message?: string };
    const promoActive =
      !!promo?.active && (!promo.expiresAt || new Date(promo.expiresAt).getTime() > Date.now());
    if (promoActive && plan === "indie") plan = "studio";


    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    const [{ count: monthCount }, { count: dayCount }] = await Promise.all([
      supabase
        .from("translations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", monthStart),
      supabase
        .from("translations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", dayStart),
    ]);

    const used = monthCount ?? 0;
    const usedToday = dayCount ?? 0;
    const isAdmin = !!adminRow;
    // Everything is free for everyone — no plan gating.
    const unlimited = true;
    plan = "enterprise";
    const limit = unlimited ? null : FREE_MONTHLY_LIMIT;
    const dailyLimit = unlimited ? null : FREE_DAILY_LIMIT;
    const remaining = unlimited ? null : Math.max(0, FREE_MONTHLY_LIMIT - used);
    const remainingToday = unlimited ? null : Math.max(0, FREE_DAILY_LIMIT - usedToday);
    const exhausted = !unlimited && (used >= FREE_MONTHLY_LIMIT || usedToday >= FREE_DAILY_LIMIT);

    const nextReset = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString();
    const nextDailyReset = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    ).toISOString();

    return {
      plan,
      used,
      limit,
      remaining,
      usedToday,
      dailyLimit,
      remainingToday,
      exhausted,
      unlimited,
      nextReset,
      nextDailyReset,
      isAdmin: !!isAdmin,
      unlimitedUntil: profile?.unlimited_until ?? null,
      promoActive,
      promoExpiresAt: promo?.expiresAt ?? null,
      promoMessage: promo?.message ?? "",
    };
  });


export const getUsageHistory = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return [] as Array<{ month: string; files: number; languages: number }>;
    const { supabase, userId } = auth as { supabase: any; userId: string };
    const months = 6;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

    const { data } = await supabase
      .from("translations")
      .select("created_at, target_lang")
      .eq("user_id", userId)
      .gte("created_at", start.toISOString());

    const buckets = new Map<string, { files: number; langs: Set<string> }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, { files: 0, langs: new Set() });
    }

    for (const row of (data ?? []) as Array<{ created_at: string; target_lang: string | null }>) {
      const d = new Date(row.created_at);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key);
      if (!b) continue;
      b.files += 1;
      if (row.target_lang) b.langs.add(row.target_lang);
    }

    return Array.from(buckets.entries()).map(([month, v]) => ({
      month,
      files: v.files,
      languages: v.langs.size,
    }));
  });
