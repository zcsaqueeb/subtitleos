import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dispatch } from "@/lib/translation/dispatcher.server";
import { assertFeatureUnlocked } from "@/lib/feature-locks.server";

const SummarizeInput = z.object({
  transcript: z.string().min(10).max(400_000),
  mode: z.enum(["video", "audio"]).default("audio"),
  style: z.enum(["brief", "detailed", "bullets", "chapters"]).default("bullets"),
  language: z.string().min(2).max(10).default("en"),
  speakerLabels: z.boolean().optional().default(false),
  provider: z.object({
    providerId: z.string().default("lovable"),
    apiKey: z.string().optional(),
    url: z.string().optional(),
    model: z.string().optional(),
    region: z.string().optional(),
    apiVersion: z.string().optional(),
    folderId: z.string().optional(),
  }).optional(),
});


async function isAllowed(supabase: any, userId: string): Promise<boolean> {
  const { data: adminRow } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (adminRow) return true;
  const { data: override } = await supabase
    .from("transcribe_overrides").select("unlimited, expires_at").eq("user_id", userId).maybeSingle();
  if (override && (!override.expires_at || new Date(override.expires_at).getTime() > Date.now())) return true;
  const { data: profile } = await supabase
    .from("profiles").select("plan, unlimited_until").eq("id", userId).maybeSingle();
  const grantUntil = profile?.unlimited_until ? new Date(profile.unlimited_until).getTime() : 0;
  if (grantUntil > Date.now()) return true;
  const { data: promo } = await supabase
    .from("app_settings").select("value").eq("key", "global_studio_promo").maybeSingle();
  const p = (promo?.value ?? null) as null | { active?: boolean; expiresAt?: string | null };
  if (p?.active && (!p.expiresAt || new Date(p.expiresAt).getTime() > Date.now())) return true;
  const plan = profile?.plan ?? "indie";
  return plan === "studio" || plan === "enterprise";
}

export const summarizeMedia = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SummarizeInput.parse(data))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (auth) await assertFeatureUnlocked(auth.supabase, auth.userId, "ai_summaries");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured.");

    const styleRules: Record<string, string> = {
      brief: "Write a tight 3-5 sentence executive summary.",
      detailed: "Write a thorough multi-paragraph summary capturing all key points, arguments, and conclusions.",
      bullets: "Return 8-15 concise bullet points covering the main ideas in order.",
      chapters: "Return a chapter-style outline: a markdown list where each item is `**Title** — one-sentence description`.",
    };

    const provider = data.provider ?? { providerId: "lovable" };
    const useExternalProvider = provider.providerId && provider.providerId !== "lovable";
    // If using an external translation provider, generate summary in English first then translate.
    const summaryLang = useExternalProvider ? "en" : data.language;

    const system = [
      `You are a professional ${data.mode === "video" ? "video" : "audio"} content summarizer.`,
      `Summarize the provided transcript faithfully — do not invent facts, names, or numbers.`,
      `Preserve tone and intent. Keep names, products, and figures exactly as transcribed.`,
      `Output language: ${summaryLang}.`,
      styleRules[data.style],
      data.speakerLabels
        ? [
            `Speaker labels are ENABLED. Identify distinct speakers from cues in the transcript (turn-taking, names mentioned, "I/you" shifts).`,
            `Label them as **Speaker 1**, **Speaker 2**, etc., or use a real name when explicitly stated.`,
            `Begin the output with a "## Speakers" section listing each speaker and a one-line role/description.`,
            `Speaker attribution highlights — REQUIRED: every sentence or bullet that conveys a point MUST start with a bold speaker tag mapping the content to its speaker, formatted exactly as \`**[Speaker 1]**\` (or the real name in brackets, e.g. \`**[Alice]**\`). Example bullet: "- **[Speaker 2]** explained the rollout timeline and the two-week pilot window."`,
            `If multiple speakers contributed to one point, chain tags: \`**[Speaker 1 → Speaker 2]**\`. Never leave a sentence unattributed when speaker labels are enabled. Keep the bracket tags consistent across the Key Takeaways section too.`,
          ].join(" ")
        : `Do NOT add speaker labels or attributions.`,
      `Also include at the end:`,
      `## Key Takeaways`,
      `- 3 to 5 short takeaways`,
      `## Topics`,
      `- comma-separated topical tags`,
      `Return clean markdown only — no preamble, no code fences.`,
    ].join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.transcript.slice(0, 380_000) },
        ],
      }),
    });
    if (!resp.ok) {
      const body = (await resp.text()).slice(0, 300);
      if (resp.status === 429) throw new Error("Rate limited — please retry in a moment.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Plans & credits.");
      throw new Error(`Summarize failed: ${resp.status} ${body}`);
    }
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let markdown = j.choices?.[0]?.message?.content?.trim() ?? "";
    if (!markdown) throw new Error("Empty summary from model.");

    if (useExternalProvider && data.language && data.language !== "en") {
      try {
        // Split markdown into lines; translate only non-empty, non-structural lines to preserve formatting.
        const lines = markdown.split("\n");
        const indices: number[] = [];
        const cues: string[] = [];
        lines.forEach((ln, i) => {
          const trimmed = ln.trim();
          if (!trimmed) return;
          // Skip pure markdown structural lines (headings keep their text translated though)
          cues.push(trimmed.replace(/^(#+\s*|[-*]\s*)/, ""));
          indices.push(i);
        });
        if (cues.length) {
          const translated = await dispatch({
            providerId: provider.providerId,
            sourceLang: "en",
            targetLang: data.language,
            cues,
            apiKey: provider.apiKey,
            url: provider.url,
            model: provider.model,
            region: provider.region,
            apiVersion: provider.apiVersion,
            folderId: provider.folderId,
          });
          indices.forEach((lineIdx, n) => {
            const original = lines[lineIdx];
            const prefixMatch = original.match(/^(#+\s*|[-*]\s*)?/);
            const prefix = prefixMatch?.[0] ?? "";
            lines[lineIdx] = prefix + (translated[n] ?? cues[n]);
          });
          markdown = lines.join("\n");
        }
      } catch (e: any) {
        throw new Error(`Translation via ${provider.providerId} failed: ${e?.message ?? e}`);
      }
    }

    return { markdown };
  });

