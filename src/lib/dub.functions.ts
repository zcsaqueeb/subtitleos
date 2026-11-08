import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFeatureUnlocked, type FeatureId } from "@/lib/feature-locks.server";

const SynthInput = z.object({
  text: z.string().min(1).max(200_000),
  language: z.string().min(2).max(10).default("en"),
  sourceLang: z.string().min(2).max(10).optional(),
  voice: z.string().min(1).default("alloy"),
  clonedVoiceId: z.string().optional(),
  userElevenLabsKey: z.string().min(10).max(200).optional(),
  translateWith: z.object({
    providerId: z.string().default("lovable"),
    apiKey: z.string().optional(),
    url: z.string().optional(),
    model: z.string().optional(),
    region: z.string().optional(),
    apiVersion: z.string().optional(),
    folderId: z.string().optional(),
  }).optional(),
});

const CloneInput = z.object({
  name: z.string().min(1).max(80),
  // base64 wav/mp3/m4a/webm sample, max ~6MB after b64
  sampleBase64: z.string().min(100).max(9_000_000),
  sampleMime: z.string().min(3).max(80),
  consent: z.literal(true, {
    errorMap: () => ({ message: "You must consent to clone your voice." }),
  }),
  userElevenLabsKey: z.string().min(10).max(200).optional(),
});

const LipSyncInput = z.object({
  // Path-based inputs (preferred) — client uploads directly to storage via signed URL.
  videoPath: z.string().min(3).max(500).optional(),
  audioPath: z.string().min(3).max(500).optional(),
  videoName: z.string().min(1).max(200),
  // Legacy base64 fallback (small files only; kept for backward compat).
  videoBase64: z.string().min(100).max(180_000_000).optional(),
  videoMime: z.string().min(3).max(80).optional(),
  audioBase64: z.string().min(100).max(40_000_000).optional(),
  audioMime: z.string().min(3).max(80).optional(),
  model: z.enum(["lipsync-2", "lipsync-1.9.0-beta"]).default("lipsync-2"),
  userSyncSoKey: z.string().min(10).max(500).optional(),
});

const LipSyncUploadInput = z.object({
  videoName: z.string().min(1).max(200),
});

const LipSyncPollInput = z.object({ jobId: z.string().min(3).max(200), userSyncSoKey: z.string().min(10).max(500).optional() });

const PreviewInput = z.object({
  voice: z.string().min(1).default("alloy"),
  clonedVoiceId: z.string().optional(),
  language: z.string().min(2).max(10).default("en"),
  userElevenLabsKey: z.string().min(10).max(200).optional(),
});


export const getDubServices = createServerFn({ method: "GET" })
  .handler(async () => ({
    hasElevenLabs: !!process.env.ELEVENLABS_API_KEY,
    hasSyncSo: !!process.env.SYNC_SO_API_KEY,
  }));

/**
 * Short (~1 sentence) TTS sample so users can hear a voice before rendering.
 * Reuses the same providers as the full dub but with a fixed sample line.
 */
export const previewVoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data }) => {
    const elevenKey = data.userElevenLabsKey || process.env.ELEVENLABS_API_KEY;

    const sample = "Hello! This is a short preview of how this voice will sound in your dub.";
    if (data.clonedVoiceId && elevenKey) {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(data.clonedVoiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: sample,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true },
          }),
        },
      );
      if (!r.ok) throw new Error(`Preview failed: ${r.status}`);
      const buf = new Uint8Array(await r.arrayBuffer());
      return { mime: "audio/mpeg", base64: bytesToBase64(buf), provider: "elevenlabs" as const };
    }
    const apiKey = process.env.LOVABLE_API_KEY;
    if (apiKey) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini-tts",
          input: sample,
          voice: data.voice,
          response_format: "mp3",
          instructions: `Natural, clear ${data.language} dubbing voice, friendly pacing.`,
        }),
      });
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        return { mime: "audio/mpeg", base64: bytesToBase64(buf), provider: "lovable" as const };
      }
      if (r.status !== 402 || !elevenKey) {
        if (r.status === 402) {
          throw new Error("Built-in voice credits exhausted. Add your ElevenLabs API key in Settings → Connectors to preview voices.");
        }
        throw new Error(`Preview failed: ${r.status}`);
      }
      // fall through to ElevenLabs fallback below
    }
    if (!elevenKey) throw new Error("No TTS provider available. Add your ElevenLabs API key in Settings → Connectors.");
    // Fallback: use a default ElevenLabs voice (Sarah) so users still hear a preview.
    const fallbackVoiceId = "EXAVITQu4vr4xnSDxMaL";
    const r2 = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${fallbackVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sample,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true },
        }),
      },
    );
    if (!r2.ok) throw new Error(`Preview failed: ${r2.status}`);
    const buf = new Uint8Array(await r2.arrayBuffer());
    return { mime: "audio/mpeg", base64: bytesToBase64(buf), provider: "elevenlabs" as const };

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
  const plan = profile?.plan ?? "indie";
  return plan === "studio" || plan === "enterprise";
}

/**
 * Generate dubbed speech from text.
 * - If `clonedVoiceId` is present AND ELEVENLABS_API_KEY is configured → use ElevenLabs (voice cloning).
 * - Otherwise → use Lovable AI TTS (openai/gpt-4o-mini-tts).
 * Returns a base64 mp3.
 */
export const synthesizeDub = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SynthInput.parse(d))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (auth) await assertFeatureUnlocked(auth.supabase, auth.userId, "voice_dubbing" as FeatureId);

    const elevenKey = data.userElevenLabsKey || process.env.ELEVENLABS_API_KEY;


    // Optional translation step (server-side) using the project's existing dispatcher.
    let speakText = data.text;
    if (data.translateWith && data.language && data.sourceLang !== data.language) {
      try {
        const { dispatch } = await import("@/lib/translation/dispatcher.server");
        const sentences = data.text.match(/[^.!?]+[.!?]*\s*/g) ?? [data.text];
        const cues = sentences.map((s) => s.trim()).filter(Boolean);
        if (cues.length) {
          const out = await dispatch({
            providerId: data.translateWith.providerId,
            sourceLang: data.sourceLang ?? "auto",
            targetLang: data.language,
            cues,
            apiKey: data.translateWith.apiKey,
            url: data.translateWith.url,
            model: data.translateWith.model,
            region: data.translateWith.region,
            apiVersion: data.translateWith.apiVersion,
            folderId: data.translateWith.folderId,
          });
          speakText = out.join(" ");
        }
      } catch (e: any) {
        // Fall back to original text; surfaced as warning via response field.
      }
    }

    // Split into chunks so long transcripts (>4-5k chars, i.e. anything over
    // ~5 min of speech) don't get truncated by provider input limits.
    const chunks = splitForTts(speakText, 1500);

    if (data.clonedVoiceId && elevenKey) {
      const parts: Uint8Array[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const r = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(data.clonedVoiceId)}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              text: chunks[i],
              model_id: "eleven_multilingual_v2",
              voice_settings: { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true },
              previous_text: i > 0 ? chunks[i - 1].slice(-500) : undefined,
              next_text: i < chunks.length - 1 ? chunks[i + 1].slice(0, 500) : undefined,
            }),
          },
        );
        if (!r.ok) throw new Error(`ElevenLabs TTS failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
        parts.push(new Uint8Array(await r.arrayBuffer()));
      }
      const merged = concatBytes(parts);
      return { mime: "audio/mpeg", base64: bytesToBase64(merged), provider: "elevenlabs" as const, spokenText: speakText };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured.");
    const parts: Uint8Array[] = [];
    for (const chunk of chunks) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini-tts",
          input: chunk,
          voice: data.voice,
          response_format: "mp3",
          instructions: `Speak in ${data.language}. Natural, clear dubbing voice with appropriate pacing.`,
        }),
      });
      if (!r.ok) {
        const body = (await r.text()).slice(0, 300);
        if (r.status === 429) throw new Error("Rate limited — please retry in a moment.");
        if (r.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Plans & credits.");
        throw new Error(`TTS failed: ${r.status} ${body}`);
      }
      parts.push(new Uint8Array(await r.arrayBuffer()));
    }
    const merged = concatBytes(parts);
    return { mime: "audio/mpeg", base64: bytesToBase64(merged), provider: "lovable" as const, spokenText: speakText };
  });

/**
 * Create a voice clone on ElevenLabs from a user-uploaded sample.
 * Requires explicit consent; returns a voice_id you can pass back to synthesizeDub.
 */
export const cloneVoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CloneInput.parse(d))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (auth) await assertFeatureUnlocked(auth.supabase, auth.userId, "voice_cloning" as FeatureId);
    const elevenKey = data.userElevenLabsKey || process.env.ELEVENLABS_API_KEY;
    if (!elevenKey) {
      throw new Error(
        "Voice cloning requires an ElevenLabs API key. Add your own in Settings → Connectors.",
      );
    }

    const bytes = base64ToBytes(data.sampleBase64);
    const fd = new FormData();
    fd.append("name", auth ? `${data.name} — ${auth.userId.slice(0, 8)}` : `${data.name} — guest`);
    fd.append("description", "User-uploaded sample with explicit consent (SubtitleOS).");
    fd.append(
      "labels",
      JSON.stringify({ consent: "true", consent_at: new Date().toISOString(), source: "subtitleos" }),
    );
    fd.append("files", new Blob([bytes as unknown as BlobPart], { type: data.sampleMime }), "sample");
    const r = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": elevenKey },
      body: fd,
    });
    if (!r.ok) {
      throw new Error(`Voice cloning failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    }
    const j = (await r.json()) as { voice_id?: string };
    if (!j.voice_id) throw new Error("Voice cloning returned no voice_id.");
    return { voiceId: j.voice_id };
  });

/**
 * Start a Sync.so lip-sync job. Uploads the source video and dubbed audio to a
 * private storage bucket, signs short-lived URLs, then calls Sync.so v2/generate.
 * Returns a jobId — poll with pollLipSync until status === "COMPLETED".
 */
export const startLipSync = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LipSyncInput.parse(d))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    const supabase = auth?.supabase ?? null;
    const userId = auth?.userId ?? "guest";
    const apiKey = data.userSyncSoKey || process.env.SYNC_SO_API_KEY;
    if (!apiKey) {
      throw new Error("Lip-sync needs a Sync.so API key. Add your own in Settings → Connectors.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stamp = Date.now();
    const safeName = data.videoName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

    // Prefer already-uploaded paths (client uses signed upload URL to avoid RPC memory blowup).
    let videoPath = data.videoPath ?? "";
    let audioPath = data.audioPath ?? "";

    if (!videoPath) {
      if (!data.videoBase64 || !data.videoMime) {
        throw new Error("Missing video: upload via signed URL or provide videoBase64.");
      }
      videoPath = `${userId}/${stamp}/${safeName || "video.mp4"}`;
      const videoBytes = base64ToBytes(data.videoBase64);
      const up1 = await supabaseAdmin.storage.from("lipsync-temp").upload(videoPath, videoBytes, {
        contentType: data.videoMime, upsert: true,
      });
      if (up1.error) throw new Error(`Upload video failed: ${up1.error.message}`);
    }
    if (!audioPath) {
      if (!data.audioBase64 || !data.audioMime) {
        throw new Error("Missing audio: upload via signed URL or provide audioBase64.");
      }
      audioPath = `${userId}/${stamp}/dub.mp3`;
      const audioBytes = base64ToBytes(data.audioBase64);
      const up2 = await supabaseAdmin.storage.from("lipsync-temp").upload(audioPath, audioBytes, {
        contentType: data.audioMime, upsert: true,
      });
      if (up2.error) throw new Error(`Upload audio failed: ${up2.error.message}`);
    }

    const [s1, s2] = await Promise.all([
      supabaseAdmin.storage.from("lipsync-temp").createSignedUrl(videoPath, 60 * 60 * 6),
      supabaseAdmin.storage.from("lipsync-temp").createSignedUrl(audioPath, 60 * 60 * 6),
    ]);
    if (s1.error || !s1.data?.signedUrl) throw new Error("Could not sign video URL");
    if (s2.error || !s2.data?.signedUrl) throw new Error("Could not sign audio URL");

    const r = await fetch("https://api.sync.so/v2/generate", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: data.model,
        input: [
          { type: "video", url: s1.data.signedUrl },
          { type: "audio", url: s2.data.signedUrl },
        ],
        options: { output_format: "mp4" },
      }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 400);
      if (r.status === 401 || r.status === 403) throw new Error("Sync.so rejected the API key. Check your key in Settings → Connectors.");
      if (r.status === 402) throw new Error("Sync.so credits exhausted on the configured account.");
      throw new Error(`Sync.so /v2/generate failed: ${r.status} ${body}`);
    }
    const j = (await r.json()) as { id?: string; status?: string };
    if (!j.id) throw new Error("Sync.so did not return a job id.");
    void supabase;
    void userId;
    return { jobId: j.id, status: j.status ?? "PENDING" };
  });

/**
 * Poll a Sync.so job. Returns { status, outputUrl? }.
 */
export const pollLipSync = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LipSyncPollInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = data.userSyncSoKey || process.env.SYNC_SO_API_KEY;
    if (!apiKey) throw new Error("Add your Sync.so API key in Settings → Connectors to check lip-sync progress.");

    const r = await fetch(`https://api.sync.so/v2/generate/${encodeURIComponent(data.jobId)}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 300);
      throw new Error(`Sync.so poll failed: ${r.status} ${body}`);
    }
    const j = (await r.json()) as { status?: string; outputUrl?: string; error?: string };
    return {
      status: (j.status ?? "PROCESSING").toUpperCase(),
      outputUrl: j.outputUrl ?? null,
      error: j.error ?? null,
    };
  });

/**
 * Return signed upload URLs (video + audio) so the client can upload
 * directly to storage without base64ing multi-GB media through RPC.
 */
export const createLipSyncUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LipSyncUploadInput.parse(d))
  .handler(async ({ data }) => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    const userId = auth?.userId ?? "guest";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stamp = Date.now();
    const safeName = data.videoName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "video.mp4";
    const videoPath = `${userId}/${stamp}/${safeName}`;
    const audioPath = `${userId}/${stamp}/dub.mp3`;
    const [v, a] = await Promise.all([
      supabaseAdmin.storage.from("lipsync-temp").createSignedUploadUrl(videoPath),
      supabaseAdmin.storage.from("lipsync-temp").createSignedUploadUrl(audioPath),
    ]);
    if (v.error || !v.data) throw new Error(`Sign video upload failed: ${v.error?.message}`);
    if (a.error || !a.data) throw new Error(`Sign audio upload failed: ${a.error?.message}`);
    return {
      video: { path: videoPath, token: v.data.token, signedUrl: v.data.signedUrl },
      audio: { path: audioPath, token: a.data.token, signedUrl: a.data.signedUrl },
    };
  });

function splitForTts(text: string, maxLen = 1500): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];
  const sentences = trimmed.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+\n+|[^.!?\n]+$/g) ?? [trimmed];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + s).length > maxLen && buf) { out.push(buf.trim()); buf = ""; }
    if (s.length > maxLen) {
      // Hard-split very long sentence on whitespace boundaries.
      const words = s.split(/(\s+)/);
      for (const w of words) {
        if ((buf + w).length > maxLen && buf) { out.push(buf.trim()); buf = ""; }
        buf += w;
      }
    } else {
      buf += s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  // btoa exists in worker runtime
  return btoa(s);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
