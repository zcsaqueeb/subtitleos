import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// USD per 1M characters — rough public list-price midpoints. These are
// estimates for the user's own awareness, not invoiced amounts.
const COST_PER_M: Record<string, number> = {
  lovable: 0.5,
  openai: 5,
  claude: 3,
  gemini: 0.35,
  azureopenai: 5,
  deepl: 25,
  deeplx: 0,
  google: 20,
  azure: 10,
  gtxFreeAPI: 0,
  edgeFreeAPI: 0,
  alice: 0.5,
  groq: 0.3,
  openrouter: 2,
};

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base] + (sorted[base + 1] !== undefined ? rest * (sorted[base + 1] - sorted[base]) : 0);
}

function emptyStats() {
  return {
    counts: { total: 0, completed: 0, failed: 0, monthFiles: 0 },
    totalChars: 0,
    monthChars: 0,
    languagesUsed: 0,
    monthLanguagesUsed: 0,
    successRate: 100,
    speed: { avgMsPer1k: 0, p50: 0, p95: 0 },
    cost: { estimatedUsd: 0, monthUsd: 0, ratePerMillionUsd: COST_PER_M.lovable },
    recentErrors: [] as Array<{
      id: string; fileName: string; error: string | null; createdAt: string;
      targetLang: string | null; sourceLang: string | null;
    }>,
  };
}

export const getDashboardStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return emptyStats();
    const { supabase, userId } = auth as unknown as { supabase: any; userId: string };

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { data: rows } = await supabase
      .from("translations")
      .select("id, status, char_count, duration_ms, target_lang, source_lang, created_at, error_message, file_name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    const all = (rows ?? []) as Array<{
      id: string; status: string; char_count: number | null; duration_ms: number | null;
      target_lang: string | null; source_lang: string | null; created_at: string;
      error_message: string | null; file_name: string;
    }>;
    const ofMonth = all.filter((r) => new Date(r.created_at) >= monthStart);
    const completed = all.filter((r) => r.status === "completed");
    const failed = all.filter((r) => r.status === "failed");

    const totalChars = all.reduce((s, r) => s + (r.char_count ?? 0), 0);
    const monthChars = ofMonth.reduce((s, r) => s + (r.char_count ?? 0), 0);
    const langs = new Set<string>();
    for (const r of all) if (r.target_lang) langs.add(r.target_lang);
    const monthLangs = new Set<string>();
    for (const r of ofMonth) if (r.target_lang) monthLangs.add(r.target_lang);

    // Processing speed — ms per 1k chars.
    const speeds = completed
      .filter((r) => (r.char_count ?? 0) > 0 && (r.duration_ms ?? 0) > 0)
      .map((r) => ((r.duration_ms as number) / (r.char_count as number)) * 1000)
      .sort((a, b) => a - b);

    const successRate = all.length ? Math.round((completed.length / all.length) * 100) : 100;

    // Cost estimate — assume Lovable default unless we knew per-row provider.
    const estCost = (totalChars / 1_000_000) * COST_PER_M.lovable;
    const monthCost = (monthChars / 1_000_000) * COST_PER_M.lovable;

    return {
      counts: {
        total: all.length,
        completed: completed.length,
        failed: failed.length,
        monthFiles: ofMonth.length,
      },
      totalChars,
      monthChars,
      languagesUsed: langs.size,
      monthLanguagesUsed: monthLangs.size,
      successRate,
      speed: {
        avgMsPer1k: speeds.length ? Math.round(speeds.reduce((s, n) => s + n, 0) / speeds.length) : 0,
        p50: Math.round(quantile(speeds, 0.5)),
        p95: Math.round(quantile(speeds, 0.95)),
      },
      cost: {
        estimatedUsd: Number(estCost.toFixed(4)),
        monthUsd: Number(monthCost.toFixed(4)),
        ratePerMillionUsd: COST_PER_M.lovable,
      },
      recentErrors: failed.slice(0, 20).map((r) => ({
        id: r.id, fileName: r.file_name, error: r.error_message, createdAt: r.created_at,
        targetLang: r.target_lang, sourceLang: r.source_lang,
      })),
    };
  });

const HistoryInput = z.object({
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
  q: z.string().max(200).optional(),
  status: z.enum(["all", "completed", "failed", "processing"]).default("all"),
  lang: z.string().max(10).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const listTranslationsPaged = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => HistoryInput.parse(input))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
    const { supabase, userId } = auth as unknown as { supabase: any; userId: string };
    let q = supabase
      .from("translations")
      .select("id, file_name, source_lang, target_lang, status, char_count, duration_ms, created_at, error_message", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.lang) q = q.eq("target_lang", data.lang);
    if (data.q) q = q.ilike("file_name", `%${data.q}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const fromIdx = (data.page - 1) * data.pageSize;
    const toIdx = fromIdx + data.pageSize - 1;
    const { data: rows, count, error } = await q.range(fromIdx, toIdx);
    if (error) throw new Error(error.message);
    return {
      rows: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
