import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  source_lang: z.string().min(2).max(10),
  target_lang: z.string().min(2).max(10),
  content: z.string().min(1).max(200_000),
  file_name: z.string().min(1).max(200).optional(),
});

function splitSrt(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  return normalized.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    let textStart = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/-->/.test(lines[i])) { textStart = i + 1; break; }
    }
    return { header: lines.slice(0, textStart).join("\n"), text: lines.slice(textStart).join("\n") };
  });
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

export const Route = createFileRoute("/api/public/translate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const m = auth.match(/^Bearer\s+(sos_live_[a-f0-9]{48})$/i);
        if (!m) return json({ error: "Missing or malformed Authorization: Bearer <key>" }, 401);
        const apiKey = m[1];

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const key_hash = await sha256(apiKey);
        const { data: keyRow, error: keyErr } = await supabaseAdmin
          .from("api_keys")
          .select("id, user_id, revoked")
          .eq("key_hash", key_hash)
          .maybeSingle();
        if (keyErr || !keyRow) return json({ error: "Invalid API key" }, 401);
        if (keyRow.revoked) return json({ error: "API key revoked" }, 401);

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Invalid body" }, 400);
        }
        if (body.source_lang === body.target_lang) {
          return json({ error: "source_lang and target_lang must differ" }, 400);
        }

        try {
          const { assertCanTranslate } = await import("@/lib/entitlements.server");
          await assertCanTranslate({
            supabase: supabaseAdmin,
            userId: keyRow.user_id,
            targetLang: body.target_lang,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Forbidden";
          return json({ error: msg }, 402);
        }

        const started = Date.now();
        const { data: row, error: insErr } = await supabaseAdmin
          .from("translations")
          .insert({
            user_id: keyRow.user_id,
            file_name: body.file_name ?? "api.srt",
            source_lang: body.source_lang,
            target_lang: body.target_lang,
            source_text: body.content,
            status: "processing",
            char_count: body.content.length,
          })
          .select("id")
          .single();
        if (insErr || !row) return json({ error: insErr?.message ?? "Insert failed" }, 500);

        try {
          const llmKey = process.env.LOVABLE_API_KEY;
          if (!llmKey) throw new Error("AI gateway not configured");
          const blocks = splitSrt(body.content);
          const texts = blocks.map((b) => b.text);
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${llmKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content: `You are an elite translation and localization expert with 20+ years of experience. Translate subtitle cues from ${body.source_lang} to ${body.target_lang}.\n\nTransform each cue into a polished, publication-ready version that reads naturally to native speakers. Go beyond simple translation by refining style, flow, clarity, elegance, and impact while preserving every important detail and the author's intent.\n\nOptimize for: native-level fluency, professional tone, cultural appropriateness, clear and concise language, improved readability, stronger word choice, natural sentence rhythm, error-free grammar and punctuation. The output must be indistinguishable from content originally written by a professional native writer.\n\nHard rules:\n- Match source register, tone, speaker voice and politeness/honorific level.\n- Correct grammar, gender/number agreement, native punctuation, script and locale formatting.\n- Keep proper nouns, brand names, numbers, URLs, @handles, #hashtags, code and formatting tags (<i>, <b>, {\\an8}, ♪, [NAME]:) exactly.\n- Preserve line breaks within each cue. Never add explanations or notes. Never drop or add cues.\n- Return STRICT JSON only: {"translations": string[]} with the same length and order as input. No prose, no markdown.`,
                },
                { role: "user", content: JSON.stringify({ cues: texts }) },
              ],
              response_format: { type: "json_object" },
            }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            if (resp.status === 429) throw new Error("Rate limit reached");
            if (resp.status === 402) throw new Error("AI credits exhausted");
            throw new Error(`AI gateway error (${resp.status}): ${err.slice(0, 200)}`);
          }
          const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as { translations?: string[] };
          const translations = parsed.translations ?? [];
          if (translations.length !== blocks.length) {
            throw new Error(`Model returned ${translations.length} cues but expected ${blocks.length}`);
          }
          const output = blocks
            .map((b, i) => (b.header ? `${b.header}\n${translations[i] ?? b.text}` : translations[i] ?? b.text))
            .join("\n\n");

          await supabaseAdmin
            .from("translations")
            .update({
              translated_text: output,
              status: "completed",
              duration_ms: Date.now() - started,
              completed_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          const { data: cur } = await supabaseAdmin
            .from("api_keys")
            .select("usage_count")
            .eq("id", keyRow.id)
            .single();
          await supabaseAdmin
            .from("api_keys")
            .update({
              last_used_at: new Date().toISOString(),
              usage_count: (cur?.usage_count ?? 0) + 1,
            })
            .eq("id", keyRow.id);

          return json({
            id: row.id,
            source_lang: body.source_lang,
            target_lang: body.target_lang,
            translated_text: output,
            duration_ms: Date.now() - started,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          await supabaseAdmin
            .from("translations")
            .update({ status: "failed", error_message: message, duration_ms: Date.now() - started })
            .eq("id", row.id);
          return json({ error: message }, 500);
        }
      },
    },
  },
});
