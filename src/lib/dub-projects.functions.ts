import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHARACTER_TYPES, defaultVoiceForType, emotionSettings, EMOTIONS, type CharacterType } from "@/lib/dub-character-types";

// ---------- SRT / script parsing ----------
type ParsedLine = { idx: number; start_ms: number | null; end_ms: number | null; speaker: string | null; text: string };

function tsToMs(ts: string): number {
  const m = ts.match(/(\d+):(\d+):(\d+)[.,](\d+)/);
  if (!m) return 0;
  return (+m[1]) * 3600000 + (+m[2]) * 60000 + (+m[3]) * 1000 + (+m[4]);
}

function parseInputScript(raw: string): ParsedLine[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const looksSrt = /^\d+\s*\n\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(text);
  const out: ParsedLine[] = [];
  if (looksSrt) {
    const blocks = text.split(/\n\n+/);
    let i = 0;
    for (const b of blocks) {
      const lines = b.split("\n").filter(Boolean);
      if (lines.length < 2) continue;
      const timing = lines[1]?.match(/(\S+)\s*-->\s*(\S+)/);
      const bodyLines = lines.slice(2);
      const body = bodyLines.join(" ").replace(/<[^>]+>/g, "").trim();
      if (!body) continue;
      const spMatch = body.match(/^([A-Z][A-Za-z0-9 _\-]{0,30}):\s*(.+)$/);
      out.push({
        idx: i++,
        start_ms: timing ? tsToMs(timing[1]) : null,
        end_ms: timing ? tsToMs(timing[2]) : null,
        speaker: spMatch ? spMatch[1].trim() : null,
        text: spMatch ? spMatch[2].trim() : body,
      });
    }
    return out;
  }
  // Plain script: "NAME: text" per line, or free lines.
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let i = 0;
  for (const l of lines) {
    const m = l.match(/^([A-Z][A-Za-z0-9 _\-]{0,30}):\s*(.+)$/);
    out.push({ idx: i++, start_ms: null, end_ms: null, speaker: m ? m[1].trim() : null, text: m ? m[2].trim() : l });
  }
  return out;
}

// ---------- schemas ----------
const CreateInput = z.object({
  name: z.string().min(1).max(120),
  script: z.string().min(1).max(2_000_000),
  sourceLang: z.string().min(2).max(10).optional(),
  targetLang: z.string().min(2).max(10).optional(),
  stylePreset: z.string().max(40).optional(),
  sourceVideoPath: z.string().min(3).max(500).optional(),
  sourceVideoName: z.string().min(1).max(200).optional(),
});
const IdInput = z.object({ projectId: z.string().uuid() });
const UpdateCharacter = z.object({
  characterId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  character_type: z.string().max(40).optional(),
  voice_id: z.string().max(200).nullable().optional(),
  voice_provider: z.enum(["elevenlabs","lovable"]).optional(),
  clone_provider: z.enum(["elevenlabs","browser"]).optional(),
  sample_line: z.string().max(600).nullable().optional(),
  locked: z.boolean().optional(),
});

const AddCharacter = z.object({ projectId: z.string().uuid(), name: z.string().min(1).max(120), character_type: z.string().max(40).default("neutral") });
const DeleteChar = z.object({ characterId: z.string().uuid() });
const UpdateLine = z.object({
  lineId: z.string().uuid(),
  text: z.string().max(4000).optional(),
  translated_text: z.string().max(4000).nullable().optional(),
  emotion: z.string().max(40).nullable().optional(),
  character_id: z.string().uuid().nullable().optional(),
  locked: z.boolean().optional(),
});
const RenderLine = z.object({ lineId: z.string().uuid(), userElevenLabsKey: z.string().min(10).max(200).optional() });
const RenderProject = z.object({ projectId: z.string().uuid(), onlyMissing: z.boolean().default(true), userElevenLabsKey: z.string().min(10).max(200).optional() });

// ---------- helpers ----------
async function assertOwns(supabase: any, userId: string, projectId: string) {
  const { data, error } = await supabase.from("dub_projects").select("id, user_id").eq("id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("Project not found");
}

// Guest-tolerant auth: returns empty results instead of throwing 401.
const optionalAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getOptionalUser } = await import("./optional-auth.server");
  const auth = await getOptionalUser();
  return next({ context: { supabase: auth?.supabase ?? null, userId: auth?.userId ?? null } });
});

// ---------- list / get / create ----------
export const listDubProjects = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    if (!supabase || !userId) return { projects: [] };
    const { data, error } = await supabase
      .from("dub_projects").select("id,name,source_lang,target_lang,style_preset,status,created_at,updated_at")
      .eq("user_id", userId).order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { projects: data ?? [] };
  });

export const getDubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertOwns(supabase, userId, data.projectId);
    const [{ data: project }, { data: characters }, { data: lines }] = await Promise.all([
      supabase.from("dub_projects").select("*").eq("id", data.projectId).single(),
      supabase.from("dub_characters").select("*").eq("project_id", data.projectId).order("name"),
      supabase.from("dub_lines").select("*").eq("project_id", data.projectId).order("idx"),
    ]);
    return { project, characters: characters ?? [], lines: lines ?? [] };
  });

export const createDubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const parsed = parseInputScript(data.script);
    if (parsed.length === 0) throw new Error("No dialogue found in the provided script.");
    if (parsed.length > 5000) throw new Error("Script too large (max 5,000 lines per project).");

    // Insert project
    const { data: proj, error: pErr } = await supabase.from("dub_projects").insert({
      user_id: userId, name: data.name,
      source_lang: data.sourceLang ?? null,
      target_lang: data.targetLang ?? null,
      style_preset: data.stylePreset ?? null,
      source_video_path: data.sourceVideoPath ?? null,
      source_video_name: data.sourceVideoName ?? null,
      status: "draft",
    }).select("id").single();
    if (pErr) throw new Error(pErr.message);
    const projectId = proj.id as string;

    // Character detection via Lovable AI (Gemini). Falls back to speaker labels.
    const knownSpeakers = Array.from(new Set(parsed.map((p) => p.speaker).filter(Boolean))) as string[];
    let charMap: Record<string, { name: string; type: CharacterType }> = {};
    let lineAssignments: Array<{ speaker: string; emotion: string }> = [];

    const apiKey = process.env.LOVABLE_API_KEY;
    if (apiKey) {
      try {
        const sample = parsed.slice(0, 500).map((p, i) => `${i}. ${p.speaker ? `[${p.speaker}] ` : ""}${p.text}`).join("\n");
        const prompt = `You are analyzing a dubbing script. Detect all unique characters, classify each into one of these types: ${CHARACTER_TYPES.map((c) => c.id).join(", ")}. Also tag every line with one emotion from: ${EMOTIONS.join(", ")}.

Return STRICT JSON only, no prose:
{"characters":[{"name":"NAME","type":"adult_male"}],"lines":[{"idx":0,"speaker":"NAME","emotion":"neutral"}]}

- If speaker labels are already present in brackets, prefer them.
- Never assign one voice to all — detect every distinct speaker.
- Use "Narrator" for narration/voice-over. Use "Neutral" only if you cannot decide.

SCRIPT:
${sample}`;
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (r.ok) {
          const j = await r.json() as any;
          const content = j.choices?.[0]?.message?.content;
          const parsedJson = typeof content === "string" ? JSON.parse(content) : content;
          for (const c of parsedJson.characters ?? []) {
            const type = (CHARACTER_TYPES.find((x) => x.id === c.type)?.id ?? "neutral") as CharacterType;
            charMap[String(c.name)] = { name: String(c.name), type };
          }
          for (const l of parsedJson.lines ?? []) {
            lineAssignments[Number(l.idx)] = { speaker: String(l.speaker ?? "Speaker 1"), emotion: String(l.emotion ?? "neutral") };
          }
        }
      } catch { /* fallback below */ }
    }

    // Fallback: use speaker labels; if none, put everything on "Speaker 1"
    if (Object.keys(charMap).length === 0) {
      const names = knownSpeakers.length ? knownSpeakers : ["Speaker 1"];
      for (const n of names) charMap[n] = { name: n, type: "neutral" };
    }

    // Insert characters
    const charRows = Object.values(charMap).map((c) => ({
      project_id: projectId, name: c.name, character_type: c.type,
      voice_id: defaultVoiceForType(c.type), voice_provider: "elevenlabs",
    }));
    const { data: charsInserted, error: cErr } = await supabase.from("dub_characters").insert(charRows).select("id,name");
    if (cErr) throw new Error(cErr.message);
    const nameToId = new Map((charsInserted ?? []).map((c: any) => [c.name, c.id as string]));

    // Insert lines (batch of 500)
    const lineRows = parsed.map((p) => {
      const assigned = lineAssignments[p.idx];
      const speaker = assigned?.speaker ?? p.speaker ?? Object.values(charMap)[0].name;
      const cid = nameToId.get(speaker) ?? nameToId.get(Object.values(charMap)[0].name) ?? null;
      return {
        project_id: projectId, character_id: cid, idx: p.idx,
        start_ms: p.start_ms, end_ms: p.end_ms, text: p.text,
        emotion: assigned?.emotion ?? "neutral",
      };
    });
    for (let i = 0; i < lineRows.length; i += 500) {
      const chunk = lineRows.slice(i, i + 500);
      const { error } = await supabase.from("dub_lines").insert(chunk);
      if (error) throw new Error(error.message);
    }

    return { projectId };
  });

// ---------- character mutations ----------
export const updateDubCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateCharacter.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.character_type !== undefined) patch.character_type = data.character_type;
    if (data.voice_id !== undefined) patch.voice_id = data.voice_id;
    if (data.voice_provider !== undefined) patch.voice_provider = data.voice_provider;
    if (data.clone_provider !== undefined) patch.clone_provider = data.clone_provider;
    if (data.sample_line !== undefined) patch.sample_line = data.sample_line;
    if (data.locked !== undefined) patch.locked = data.locked;
    const { error } = await supabase.from("dub_characters").update(patch).eq("id", data.characterId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addDubCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddCharacter.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertOwns(supabase, userId, data.projectId);
    const { data: row, error } = await supabase.from("dub_characters").insert({
      project_id: data.projectId, name: data.name, character_type: data.character_type,
      voice_id: defaultVoiceForType(data.character_type), voice_provider: "elevenlabs",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { characterId: row.id as string };
  });

export const deleteDubCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteChar.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase.from("dub_characters").delete().eq("id", data.characterId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- line mutations ----------
export const updateDubLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateLine.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const patch: any = {};
    for (const k of ["text","translated_text","emotion","character_id","locked"] as const) {
      if ((data as any)[k] !== undefined) patch[k] = (data as any)[k];
    }
    // Invalidate audio when text/emotion/character changed
    if (patch.text !== undefined || patch.emotion !== undefined || patch.character_id !== undefined || patch.translated_text !== undefined) {
      patch.audio_url = null;
    }
    const { error } = await supabase.from("dub_lines").update(patch).eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- rendering ----------
async function writeProgress(supabase: any, projectId: string, lineId: string | null, stage: string, pct: number, message?: string) {
  try {
    await supabase.from("dub_render_progress").insert({ project_id: projectId, line_id: lineId, stage, pct, message: message ?? null });
  } catch { /* progress is best-effort */ }
}

// Word- and char-aware duration estimate. Uses whichever is longer so short punchy
// lines with long words (e.g. "Extraordinary!") aren't underestimated. ~155 wpm
// average speaking rate; ~55ms/char fallback for non-space scripts (CJK etc.).
function estimateSpeechMs(text: string): number {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return 0;
  const chars = clean.length;
  const words = clean.split(/\s+/).length;
  const byWord = Math.round((words / 155) * 60_000);
  const byChar = Math.round(chars * 55);
  return Math.max(500, byWord, byChar);
}

// Returns a speed factor in [0.85, 1.15] — the safe range for natural prosody and
// lip-sync. Uses the "available" window when a gap to the next cue exists so short
// overruns are absorbed instead of forcing an unnaturally fast delivery.
function computeSpeedForWindow(
  text: string,
  targetMs: number | null | undefined,
  availableMs?: number | null,
): number {
  const window = availableMs && availableMs > 0 ? availableMs : (targetMs ?? 0);
  if (!window || window <= 0) return 1;
  const est = estimateSpeechMs(text);
  if (est <= 0) return 1;
  const ratio = est / window;
  // Small dead-zone: within ±3% of the window, keep natural 1.0x.
  if (ratio >= 0.97 && ratio <= 1.03) return 1;
  return Math.max(0.85, Math.min(1.15, Number(ratio.toFixed(3))));
}

// Compute per-line "available_ms" = window + min(gap_to_next, 400ms) headroom.
function annotateAvailableMs(rows: any[]): any[] {
  const sorted = rows.slice().sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0));
  const nextStart = new Map<any, number | null>();
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[i + 1];
    nextStart.set(sorted[i], next?.start_ms ?? null);
  }
  return rows.map((r) => {
    if (r.start_ms == null || r.end_ms == null) return { ...r, _available_ms: null };
    const win = r.end_ms - r.start_ms;
    const ns = nextStart.get(r);
    const gap = ns != null ? Math.max(0, ns - r.end_ms) : 400;
    return { ...r, _available_ms: win + Math.min(gap, 400) };
  });
}

async function renderOneLine(opts: {
  supabase: any; line: any; character: any; elevenKey?: string; lovableKey?: string; projectId?: string;
}) {
  const { supabase, line, character, elevenKey, lovableKey, projectId } = opts;
  const speakText = (line.translated_text ?? line.text ?? "").toString().slice(0, 5000);
  if (!speakText) return;
  const targetMs = (line.start_ms != null && line.end_ms != null) ? (line.end_ms - line.start_ms) : null;
  const availableMs = (line as any)._available_ms ?? null;
  const speed = computeSpeedForWindow(speakText, targetMs, availableMs);

  if (projectId) await writeProgress(supabase, projectId, line.id, "tts", 20);

  let audioBase64: string = ""; let mime = "audio/mpeg";
  const useEleven = character?.voice_provider !== "lovable" && !!character?.voice_id && !!elevenKey;
  let attempt = 0; const maxAttempts = 3;
  while (true) {
    attempt++;
    try {
      if (useEleven) {
        const settings = { ...emotionSettings(line.emotion), speed };
        const r = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(character.voice_id)}?output_format=mp3_44100_128`,
          { method: "POST", headers: { "xi-api-key": elevenKey!, "Content-Type": "application/json" },
            body: JSON.stringify({ text: speakText, model_id: "eleven_multilingual_v2", voice_settings: settings }) },
        );
        if (!r.ok) {
          const status = r.status;
          if ((status === 429 || status >= 500) && attempt < maxAttempts) {
            await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
            continue;
          }
          throw new Error(`ElevenLabs: ${status} ${(await r.text()).slice(0,120)}`);
        }
        audioBase64 = bytesToBase64(new Uint8Array(await r.arrayBuffer()));
      } else {
        if (!lovableKey) throw new Error("No TTS provider available. Add ElevenLabs key in Settings → Connectors.");
        const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
          body: JSON.stringify({ model: "openai/gpt-4o-mini-tts", input: speakText.slice(0,4000),
            voice: character?.voice_id ?? "alloy", response_format: "mp3",
            instructions: `Deliver with ${line.emotion ?? "neutral"} emotion. Keep the character voice consistent. Pace ~${speed.toFixed(2)}x.` }),
        });
        if (!r.ok) {
          if ((r.status === 429 || r.status >= 500) && attempt < maxAttempts) {
            await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
            continue;
          }
          throw new Error(`Lovable TTS: ${r.status}`);
        }
        audioBase64 = bytesToBase64(new Uint8Array(await r.arrayBuffer()));
      }
      break;
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
    }
  }
  if (projectId) await writeProgress(supabase, projectId, line.id, "store", 80);
  const dataUrl = `data:${mime};base64,${audioBase64}`;
  const renderedMs = targetMs ? Math.round(estimateSpeechMs(speakText) / speed) : estimateSpeechMs(speakText);
  const { error } = await supabase.from("dub_lines").update({
    audio_url: dataUrl,
    rendered_ms: renderedMs,
    stretch_factor: speed,
    trim_ms: 0,
  }).eq("id", line.id);
  if (error) throw new Error(error.message);
  if (projectId) await writeProgress(supabase, projectId, line.id, "done", 100);
}

export const renderDubLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RenderLine.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: line, error } = await supabase.from("dub_lines").select("*").eq("id", data.lineId).single();
    if (error || !line) throw new Error("Line not found");
    const { data: character } = await supabase.from("dub_characters").select("*").eq("id", line.character_id).maybeSingle();
    await renderOneLine({
      supabase, line, character,
      elevenKey: data.userElevenLabsKey || process.env.ELEVENLABS_API_KEY,
      lovableKey: process.env.LOVABLE_API_KEY,
    });
    return { ok: true };
  });

export const renderDubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RenderProject.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertOwns(supabase, userId, data.projectId);
    // Reset progress log for a clean run.
    await supabase.from("dub_render_progress").delete().eq("project_id", data.projectId);
    await supabase.from("dub_projects").update({ status: "rendering" }).eq("id", data.projectId);
    const [{ data: lines }, { data: chars }] = await Promise.all([
      supabase.from("dub_lines").select("*").eq("project_id", data.projectId).order("idx"),
      supabase.from("dub_characters").select("*").eq("project_id", data.projectId),
    ]);
    const charById = new Map((chars ?? []).map((c: any) => [c.id, c]));
    // Pre-compute per-line "available window" (cue window + up to 400ms of the
    // gap to the next cue) so speed calculation can absorb small overruns
    // instead of forcing every line to the raw cue window.
    const annotated = annotateAvailableMs(lines ?? []);
    const todo = annotated.filter((l: any) => {
      if (l.locked && l.audio_url) return false;
      return data.onlyMissing ? !l.audio_url : true;
    });
    const elevenKey = data.userElevenLabsKey || process.env.ELEVENLABS_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    await writeProgress(supabase, data.projectId, null, "batch_start", 0, `0/${todo.length}`);
    let done = 0; let failed = 0; const failedIds: string[] = [];
    const CONCURRENCY = 6;
    async function renderWithRetry(line: any) {
      try {
        await renderOneLine({ supabase, line, character: charById.get(line.character_id), elevenKey, lovableKey, projectId: data.projectId });
      } catch (e) {
        // One retry with a short backoff before surfacing failure.
        await new Promise((r) => setTimeout(r, 800));
        await renderOneLine({ supabase, line, character: charById.get(line.character_id), elevenKey, lovableKey, projectId: data.projectId });
      }
    }
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const chunk = todo.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((line: any) => renderWithRetry(line)));
      results.forEach((r, k) => {
        if (r.status === "fulfilled") { done++; } else { failed++; failedIds.push(chunk[k].id); }
      });
      const total = todo.length || 1;
      const pct = Math.round(((done + failed) / total) * 100);
      await writeProgress(supabase, data.projectId, null, "batch", pct, `${done + failed}/${total}`);
    }
    await writeProgress(supabase, data.projectId, null, "batch_done", 100, `${done} ok · ${failed} failed`);
    await supabase.from("dub_projects").update({ status: failed && !done ? "failed" : "complete" }).eq("id", data.projectId);
    return { rendered: done, failed, total: todo.length, failedIds };
  });

// ---------- Progress reader ----------
export const getDubProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertOwns(supabase, userId, data.projectId);
    const { data: rows } = await supabase
      .from("dub_render_progress").select("stage,pct,message,line_id,updated_at")
      .eq("project_id", data.projectId).order("updated_at", { ascending: false }).limit(1);
    return { progress: rows?.[0] ?? null };
  });

// ---------- Validation gate ----------
export const validateDubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertOwns(supabase, userId, data.projectId);
    const [{ data: characters }, { data: lines }] = await Promise.all([
      supabase.from("dub_characters").select("id,name,voice_id").eq("project_id", data.projectId),
      supabase.from("dub_lines").select("id,idx,start_ms,end_ms,text,translated_text,character_id,audio_url,rendered_ms").eq("project_id", data.projectId).order("idx"),
    ]);
    const chars = characters ?? []; const rows = lines ?? [];
    const issues: Array<{ code: string; lineId?: string; message: string }> = [];
    const missingLineIds: string[] = [];
    const overflowLineIds: string[] = [];
    let totalSourceMs = 0; let totalRenderedMs = 0;

    for (const c of chars) {
      if (!c.voice_id) issues.push({ code: "missing_voice", message: `Character "${c.name}" has no voice assigned.` });
    }
    const charCoverage = chars.map((c: any) => {
      const cLines = rows.filter((l: any) => l.character_id === c.id);
      return { characterId: c.id, name: c.name, voice_id: c.voice_id, dubbed: cLines.filter((l: any) => !!l.audio_url).length, total: cLines.length };
    });

    // Include gap-to-next headroom when judging overflow so a line that spills
    // 100ms into silence isn't flagged. Drift tolerance tightened to 0.5%.
    const annotatedRows = annotateAvailableMs(rows);
    for (const l of annotatedRows) {
      if (!l.audio_url) { missingLineIds.push(l.id); issues.push({ code: "missing_audio", lineId: l.id, message: `Line ${l.idx + 1} has no audio.` }); }
      if (l.start_ms != null && l.end_ms != null) {
        const win = l.end_ms - l.start_ms;
        const available = l._available_ms ?? win;
        totalSourceMs += win;
        const rms = l.rendered_ms ?? win;
        totalRenderedMs += rms;
        if (rms > available * 1.10) {
          overflowLineIds.push(l.id);
          const pct = Math.round(((rms / win) - 1) * 100);
          issues.push({ code: "overflow", lineId: l.id, message: `Line ${l.idx + 1} audio is ${pct}% longer than its window.` });
        }
      }
    }
    const driftMs = totalRenderedMs - totalSourceMs;
    const driftOk = totalSourceMs === 0 ? true : (Math.abs(driftMs) <= 300 || Math.abs(driftMs) / totalSourceMs <= 0.005);
    if (!driftOk) issues.push({ code: "drift", message: `Timeline drift ${driftMs} ms exceeds tolerance (±0.5%).` });

    const ok = missingLineIds.length === 0 && overflowLineIds.length === 0 && driftOk && chars.every((c: any) => !!c.voice_id);
    return {
      ok,
      totalLines: rows.length,
      dubbedLines: rows.filter((l: any) => !!l.audio_url).length,
      missingLineIds,
      overflowLineIds,
      totalSourceMs, totalRenderedMs, driftMs,
      characterCoverage: charCoverage,
      issues: issues.slice(0, 50),
    };
  });

// ---------- Phase 3: character-aware translation + export ----------
const TranslateInput = z.object({
  projectId: z.string().uuid(),
  lineIds: z.array(z.string().uuid()).optional(),
  targetLang: z.string().min(2).max(10).optional(),
  sourceLang: z.string().min(2).max(10).optional(),
  stylePreset: z.string().max(40).optional(),
  onlyMissing: z.boolean().default(false),
});

export const translateDubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TranslateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertOwns(supabase, userId, data.projectId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY on server.");

    const [{ data: project }, { data: characters }, { data: lines }] = await Promise.all([
      supabase.from("dub_projects").select("*").eq("id", data.projectId).single(),
      supabase.from("dub_characters").select("*").eq("project_id", data.projectId),
      supabase.from("dub_lines").select("*").eq("project_id", data.projectId).order("idx"),
    ]);
    const targetLang = data.targetLang ?? project.target_lang;
    if (!targetLang) throw new Error("Set a target language on the project (or pass targetLang).");
    const sourceLang = data.sourceLang ?? project.source_lang ?? "auto";
    const stylePreset = data.stylePreset ?? project.style_preset ?? "dub";
    const charById = new Map((characters ?? []).map((c: any) => [c.id, c]));

    // Persist project-level target/style/source if changed
    const projPatch: any = {};
    if (data.targetLang && data.targetLang !== project.target_lang) projPatch.target_lang = data.targetLang;
    if (data.sourceLang && data.sourceLang !== project.source_lang) projPatch.source_lang = data.sourceLang;
    if (data.stylePreset && data.stylePreset !== project.style_preset) projPatch.style_preset = data.stylePreset;
    if (Object.keys(projPatch).length) await supabase.from("dub_projects").update(projPatch).eq("id", data.projectId);

    // Select lines to translate
    const idSet = data.lineIds ? new Set(data.lineIds) : null;
    const targets = (lines ?? []).filter((l: any) => {
      if (l.locked) return false;
      if (idSet && !idSet.has(l.id)) return false;
      if (data.onlyMissing && l.translated_text) return false;
      return true;
    });
    if (!targets.length) return { translated: 0, total: 0 };

    // Character-aware batches (10 lines each) with rolling context
    const { stylePresetPrompt } = await import("@/lib/translation/style-presets");
    const styleBlock = stylePresetPrompt(stylePreset as any);
    const charCard = (characters ?? []).map((c: any) => {
      const persona = (c.sample_line ?? "").toString().trim();
      return `- ${c.name} (${c.character_type})${persona ? ` — persona: ${persona.slice(0, 200)}` : ""}`;
    }).join("\n");

    let translated = 0; let failed = 0;
    const BATCH = 10;
    for (let i = 0; i < targets.length; i += BATCH) {
      const chunk = targets.slice(i, i + BATCH);
      // Prior context: 3 lines before first in chunk (project-wide, any translated)
      const firstIdx = chunk[0].idx;
      const prior = (lines ?? []).filter((l: any) => l.idx < firstIdx).slice(-3)
        .map((l: any) => `${(charById.get(l.character_id) as any)?.name ?? "?"}: ${l.translated_text ?? l.text}`).join("\n");

      const items = chunk.map((l: any) => ({
        id: l.id,
        character: (charById.get(l.character_id) as any)?.name ?? "Unknown",
        emotion: l.emotion ?? "neutral",
        source: l.text,
      }));
      const prompt = `You are a professional dubbing translator. Translate each line from ${sourceLang} to ${targetLang}, keeping each character's voice consistent across the whole project.

CHARACTERS:
${charCard || "(none listed)"}

RECENT CONTEXT (for continuity, do NOT translate):
${prior || "(start of scene)"}

RULES:
- Preserve character register/personality per line based on the character name.
- Match the source syllable count within ±15% (lip-sync).
- Do NOT add commentary. Return STRICT JSON only.
${styleBlock}

INPUT LINES (translate the "source" field into ${targetLang}):
${JSON.stringify(items)}

OUTPUT SCHEMA:
{"translations":[{"id":"<id>","text":"<translated>"}]}`;

      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (!r.ok) throw new Error(`AI ${r.status}`);
        const j = await r.json() as any;
        const content = j.choices?.[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        const map = new Map((parsed.translations ?? []).map((t: any) => [String(t.id), String(t.text ?? "")]));
        // Persist per line, and invalidate audio so re-render picks up new translation
        await Promise.all(chunk.map(async (l: any) => {
          const t = map.get(l.id);
          if (!t) { failed++; return; }
          const { error } = await supabase.from("dub_lines")
            .update({ translated_text: t, audio_url: null }).eq("id", l.id);
          if (error) { failed++; } else { translated++; }
        }));
      } catch { failed += chunk.length; }
    }
    return { translated, failed, total: targets.length };
  });

// Export SRT (translated or source), plus a JSON manifest with per-line audio data URLs.
const ExportInput = z.object({ projectId: z.string().uuid(), useTranslation: z.boolean().default(true) });
function msToSrt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = ms % 1000;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(cs).padStart(3,"0")}`;
}
export const exportDubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertOwns(supabase, userId, data.projectId);
    const [{ data: project }, { data: characters }, { data: lines }] = await Promise.all([
      supabase.from("dub_projects").select("name,source_lang,target_lang").eq("id", data.projectId).single(),
      supabase.from("dub_characters").select("id,name").eq("project_id", data.projectId),
      supabase.from("dub_lines").select("id,idx,start_ms,end_ms,text,translated_text,character_id,audio_url,emotion").eq("project_id", data.projectId).order("idx"),
    ]);
    const charById = new Map((characters ?? []).map((c: any) => [c.id, c.name]));
    const rows = (lines ?? []).filter((l: any) => l.start_ms != null && l.end_ms != null);
    let srt = "";
    rows.forEach((l: any, i: number) => {
      const body = data.useTranslation ? (l.translated_text || l.text) : l.text;
      srt += `${i + 1}\n${msToSrt(l.start_ms)} --> ${msToSrt(l.end_ms)}\n${body}\n\n`;
    });
    const manifest = {
      project: project.name,
      source_lang: project.source_lang,
      target_lang: project.target_lang,
      lines: (lines ?? []).map((l: any) => ({
        idx: l.idx, character: charById.get(l.character_id) ?? null,
        start_ms: l.start_ms, end_ms: l.end_ms, emotion: l.emotion,
        text: l.text, translated_text: l.translated_text,
        audio_data_url: l.audio_url ?? null,
      })),
    };
    return { srt, manifest };
  });

// ---------- helpers ----------
function bytesToBase64(bytes: Uint8Array): string {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  return btoa(s);
}

// ---------- Video / lip-sync helpers ----------

const LabelSrtInput = z.object({
  srt: z.string().min(1).max(2_000_000),
  hint: z.string().max(400).optional(),
});

/**
 * Convert a plain SRT (from any STT provider) into a speaker-labeled script
 * ("NAME: line") that `createDubProject` can ingest. Uses Gemini via the AI
 * gateway for diarization on the text alone (fast, works even when the STT
 * provider returned no speaker info).
 */
export const labelSpeakersInSrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LabelSrtInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured.");
    // Parse SRT cues.
    const cues: Array<{ i: number; start: string; end: string; text: string }> = [];
    const blocks = data.srt.replace(/\r\n/g, "\n").trim().split(/\n\n+/);
    for (const b of blocks) {
      const lines = b.split("\n").filter(Boolean);
      if (lines.length < 2) continue;
      const timing = lines[1]?.match(/(\S+)\s*-->\s*(\S+)/);
      if (!timing) continue;
      const body = lines.slice(2).join(" ").replace(/<[^>]+>/g, "").trim();
      if (!body) continue;
      cues.push({ i: cues.length, start: timing[1], end: timing[2], text: body });
    }
    if (!cues.length) throw new Error("No dialogue cues found in the SRT.");

    const prompt = `You are a dialogue attribution assistant. Assign each cue to a distinct SPEAKER using short stable names (e.g. NARRATOR, ALICE, BOB). Infer speakers from context, tone, and turn-taking. Use "NARRATOR" for narration/voice-over.

${data.hint ? `HINT: ${data.hint}\n` : ""}
Return STRICT JSON: {"labels":[{"i":<index>,"speaker":"NAME"}]}. Do not translate the text.

CUES:
${cues.map((c) => `${c.i}. ${c.text}`).join("\n")}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      if (r.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Plans & credits.");
      throw new Error(`Speaker labeling failed: ${r.status}`);
    }
    const j = (await r.json()) as any;
    const content = j.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    const map = new Map<number, string>();
    for (const l of parsed.labels ?? []) {
      const n = Number(l.i);
      if (!Number.isNaN(n)) map.set(n, String(l.speaker ?? "SPEAKER").toUpperCase().replace(/[^A-Z0-9_ -]/g, "").slice(0, 30) || "SPEAKER");
    }
    let out = "";
    for (const c of cues) {
      const spk = map.get(c.i) ?? "SPEAKER";
      out += `${c.i + 1}\n${c.start} --> ${c.end}\n${spk}: ${c.text}\n\n`;
    }
    return { script: out, speakerCount: new Set(map.values()).size };
  });

const ProjectMetaInput = z.object({
  projectId: z.string().uuid(),
  source_video_path: z.string().max(500).optional(),
  source_video_name: z.string().max(200).optional(),
  final_video_url: z.string().max(500).nullable().optional(),
  lipsync_job_id: z.string().max(200).nullable().optional(),
  lipsync_status: z.string().max(40).nullable().optional(),
});

export const updateDubProjectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectMetaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertOwns(supabase, userId, data.projectId);
    const patch: any = {};
    for (const k of ["source_video_path","source_video_name","final_video_url","lipsync_job_id","lipsync_status"] as const) {
      if ((data as any)[k] !== undefined) patch[k] = (data as any)[k];
    }
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await supabase.from("dub_projects").update(patch).eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

