/**
 * Build an SRT cue string from text + duration.
 * If real segments are available, use those; otherwise distribute evenly.
 */
export type Segment = { start: number; end: number; text: string };

export function fmtSrtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  const mmm = String(ms % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}

export function srtFromSegments(segments: Segment[]): string {
  return segments
    .filter((s) => s.text.trim().length > 0)
    .map(
      (s, i) =>
        `${i + 1}\n${fmtSrtTime(s.start)} --> ${fmtSrtTime(s.end)}\n${s.text.trim()}`,
    )
    .join("\n\n");
}

export function srtFromText(text: string, durationSec: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentences = cleaned
    .split(/(?<=[.!?。！？])\s+/)
    .flatMap((s) => (s.length > 120 ? s.match(/.{1,90}(?:\s|$)/g) ?? [s] : [s]))
    .map((s) => s.trim())
    .filter(Boolean);
  const totalChars = sentences.reduce((n, s) => n + s.length, 0) || 1;
  let cursor = 0;
  const segs: Segment[] = sentences.map((s) => {
    const start = (cursor / totalChars) * durationSec;
    cursor += s.length;
    const end = Math.min(durationSec, (cursor / totalChars) * durationSec);
    return { start, end, text: s };
  });
  return srtFromSegments(segs);
}

type DispatchInput = {
  providerId: string;
  apiKey?: string;
  url?: string;
  model?: string;
  language?: string;
  fileName: string;
  mime: string;
  bytes: Uint8Array;
  durationSec: number;
};

export async function dispatchTranscription(input: DispatchInput): Promise<{ srt: string; text: string }> {
  const ext =
    ({
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/ogg": "ogg",
      "audio/flac": "flac",
    } as Record<string, string>)[input.mime.split(";")[0]] ?? "webm";
  const filename = `recording.${ext}`;
  const blob = new Blob([input.bytes as BlobPart], { type: input.mime });
  const multiLang = input.language === "multi";
  // "auto" and "multi" both mean: don't lock the provider to one language.
  const language = input.language && input.language !== "auto" && input.language !== "multi" ? input.language : undefined;

  switch (input.providerId) {
    case "lovable":
      return openaiCompat({
        url: "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
        apiKey: process.env.LOVABLE_API_KEY,
        model: input.model || "openai/gpt-4o-mini-transcribe",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: false,
      });

    case "openai":
      return openaiCompat({
        url: "https://api.openai.com/v1/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "whisper-1",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "groq":
      return openaiCompat({
        url: "https://api.groq.com/openai/v1/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "whisper-large-v3",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "openai-gpt4o":
      return openaiCompat({
        url: "https://api.openai.com/v1/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "gpt-4o-transcribe",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "whisper-cpp":
    case "faster-whisper":
    case "localai":
    case "litellm":
    case "custom":
      return openaiCompat({
        url: input.url || "http://127.0.0.1:8080/v1/audio/transcriptions",
        apiKey: input.apiKey,
        requireApiKey: false,
        model: input.model || "whisper-1",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "deepgram":
      return deepgram({ apiKey: input.apiKey, model: input.model || "nova-2", blob, mime: input.mime, language, multiLang, durationSec: input.durationSec });

    case "assemblyai":
      return assemblyai({ apiKey: input.apiKey, model: input.model || "best", blob, language, multiLang, durationSec: input.durationSec });

    case "fireworks":
      return openaiCompat({
        url: "https://audio-prod.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "whisper-v3",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "elevenlabs":
      return elevenlabs({ apiKey: input.apiKey, model: input.model || "scribe_v2", blob, filename, language, durationSec: input.durationSec });

    case "gladia":
      return gladia({ apiKey: input.apiKey, blob, filename, language, multiLang, durationSec: input.durationSec });

    case "speechmatics":
      return speechmatics({ apiKey: input.apiKey, blob, filename, language, multiLang, durationSec: input.durationSec });

    case "revai":
      return revai({ apiKey: input.apiKey, blob, filename, language, durationSec: input.durationSec });

    case "azure-speech":
      return azureSpeech({ apiKey: input.apiKey, region: input.url, blob, mime: input.mime, language, durationSec: input.durationSec });

    case "google-stt":
      return googleStt({ apiKey: input.apiKey, blob, mime: input.mime, language, multiLang, durationSec: input.durationSec });

    case "replicate":
      return replicate({ apiKey: input.apiKey, model: input.model || "openai/whisper", blob, mime: input.mime, language, durationSec: input.durationSec });

    case "huggingface":
      return huggingface({ apiKey: input.apiKey, model: input.model || "openai/whisper-large-v3", blob, mime: input.mime, durationSec: input.durationSec });

    case "together":
      return openaiCompat({
        url: "https://api.together.xyz/v1/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "openai/whisper-large-v3",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "fal":
      return falAi({ apiKey: input.apiKey, model: input.model || "fal-ai/whisper", blob, mime: input.mime, language, durationSec: input.durationSec });

    case "gemini-audio":
      return geminiAudio({ apiKey: input.apiKey, model: input.model || "gemini-2.0-flash", blob, mime: input.mime, language, multiLang, durationSec: input.durationSec });

    case "qwen-audio":
      return qwenAudio({ apiKey: input.apiKey, model: input.model || "qwen-audio-turbo-latest", blob, mime: input.mime, language, multiLang, durationSec: input.durationSec });

    case "aws-transcribe":
      return awsTranscribe({ apiKey: input.apiKey, region: input.url, blob, mime: input.mime, fileName: input.fileName, language, durationSec: input.durationSec });

    case "soniox":
      return soniox({ apiKey: input.apiKey, model: input.model || "stt-async-preview", blob, filename, language, multiLang, durationSec: input.durationSec });

    case "ibm-watson":
      return ibmWatson({ apiKey: input.apiKey, instanceUrl: input.url, model: input.model || "en-US_BroadbandModel", blob, mime: input.mime, durationSec: input.durationSec });

    case "yandex-speechkit":
      return yandexSpeechkit({ apiKey: input.apiKey, folderId: input.url, blob, mime: input.mime, language, durationSec: input.durationSec });

    case "whisperx":
    case "vosk":
    case "coqui-stt":
      return localStt({ providerId: input.providerId, url: input.url, apiKey: input.apiKey, blob, filename, mime: input.mime, language, model: input.model, durationSec: input.durationSec });

    case "deepinfra":
      return openaiCompat({
        url: "https://api.deepinfra.com/v1/openai/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "openai/whisper-large-v3-turbo",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "novita":
      return openaiCompat({
        url: "https://api.novita.ai/v3/openai/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "whisper-large-v3",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "lemonfox":
      return openaiCompat({
        url: "https://api.lemonfox.ai/v1/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "whisper-1",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "openrouter-whisper":
      return openaiCompat({
        url: "https://openrouter.ai/api/v1/audio/transcriptions",
        apiKey: input.apiKey,
        model: input.model || "openai/whisper-1",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
        verbose: true,
      });

    case "runpod-whisper":
      return runpodWhisper({
        apiKey: input.apiKey,
        url: input.url || "https://api.runpod.ai/v2/faster-whisper/runsync",
        model: input.model || "large-v3",
        blob,
        language,
        multiLang,
        durationSec: input.durationSec,
      });

    case "cloudflare-workers-ai":
      return cloudflareWhisper({
        apiKey: input.apiKey,
        accountId: input.url,
        model: input.model || "@cf/openai/whisper-large-v3-turbo",
        blob,
        language,
        multiLang,
        durationSec: input.durationSec,
      });

    case "sarvam":
      return sarvamStt({
        apiKey: input.apiKey,
        model: input.model || "saarika:v2",
        blob,
        filename,
        language,
        multiLang,
        durationSec: input.durationSec,
      });

    default:
      throw new Error(`Unknown transcription provider: ${input.providerId}`);
  }
}

async function openaiCompat(args: {
  url: string;
  apiKey: string | undefined;
  requireApiKey?: boolean;
  model: string;
  blob: Blob;
  filename: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
  verbose: boolean;
}): Promise<{ srt: string; text: string }> {
  if (args.requireApiKey !== false && !args.apiKey) throw new Error("API key required.");
  const form = new FormData();
  form.append("model", args.model);
  form.append("file", args.blob, args.filename);
  if (args.language) form.append("language", args.language);
  if (args.multiLang) {
    // Whisper-style models honour a decoding prompt: nudge them to keep
    // code-switched speech in its own language/script instead of translating
    // or dropping it. Also make sure we never lock to a single language.
    form.delete("language");
    form.append(
      "prompt",
      "This audio contains multiple languages. Transcribe every line verbatim in the language actually spoken, using that language's native script. Never translate, never skip foreign-language speech.",
    );
  }

  if (args.verbose) {
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
  }
  const res = await fetch(args.url, {
    method: "POST",
    headers: args.apiKey ? { Authorization: `Bearer ${args.apiKey}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    if (res.status === 402 || /payment_required|not enough credits/i.test(msg)) {
      const isLovable = /gateway\.lovable\.dev/i.test(args.url);
      throw new Error(
        isLovable
          ? "The built-in AI transcription is out of credits for this workspace. Open Settings → Transcription and pick another provider (OpenAI Whisper, Groq, Deepgram, AssemblyAI, ElevenLabs Scribe, Gemini Audio, or any local Whisper) with your own API key — or top up Lovable AI credits."
          : "The selected provider reports insufficient credit/quota on your account. Top up that provider, or switch to a different one in Transcription settings.",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Transcription provider rejected the API key (${res.status}). Re-check the key in Transcription settings.`);
    }
    if (res.status === 429) {
      throw new Error("Transcription provider rate-limited this request. Wait a moment and press Resume, or switch provider.");
    }
    throw new Error(`Transcription failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  if (args.verbose) {
    const json = (await res.json()) as {
      text?: string;
      segments?: { start: number; end: number; text: string }[];
    };
    const text = (json.text ?? "").trim();
    if (!text) throw new Error("Empty transcript returned.");
    if (json.segments?.length) {
      return { srt: srtFromSegments(json.segments), text };
    }
    return { srt: srtFromText(text, args.durationSec), text };
  }
  const json = (await res.json()) as { text?: string };
  const text = (json.text ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  return { srt: srtFromText(text, args.durationSec), text };
}

async function deepgram(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  mime: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Deepgram API key required.");
  const params = new URLSearchParams({ model: args.model, punctuate: "true", utterances: "true" });
  if (args.multiLang) {
    // nova-3 supports true code-switching via language=multi; older models
    // fall back to per-utterance language detection.
    if (/nova-3/i.test(args.model)) params.set("language", "multi");
    else params.set("detect_language", "true");
  } else if (args.language) params.set("language", args.language);

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${args.apiKey}`, "Content-Type": args.mime || "audio/mpeg" },
    body: args.blob,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Deepgram failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const json = (await res.json()) as {
    results?: {
      utterances?: { start: number; end: number; transcript: string }[];
      channels?: { alternatives?: { transcript?: string }[] }[];
    };
  };
  const utt = json.results?.utterances ?? [];
  const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  if (!text && utt.length === 0) throw new Error("Empty transcript returned.");
  if (utt.length) {
    return {
      srt: srtFromSegments(utt.map((u) => ({ start: u.start, end: u.end, text: u.transcript }))),
      text: text || utt.map((u) => u.transcript).join(" "),
    };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

async function assemblyai(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("AssemblyAI API key required.");
  // 1) upload
  const up = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { Authorization: args.apiKey },
    body: args.blob,
  });
  if (!up.ok) throw new Error(`AssemblyAI upload failed (${up.status})`);
  const { upload_url } = (await up.json()) as { upload_url: string };

  // 2) submit
  const submit = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { Authorization: args.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_model: args.model,
      language_code: args.multiLang ? undefined : args.language,
      language_detection: args.multiLang || !args.language ? true : undefined,
      punctuate: true,
    }),
  });
  if (!submit.ok) throw new Error(`AssemblyAI submit failed (${submit.status})`);
  const { id } = (await submit.json()) as { id: string };

  // 3) poll (cap at ~3 minutes)
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const p = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { Authorization: args.apiKey },
    });
    const j = (await p.json()) as {
      status: string;
      text?: string;
      error?: string;
      utterances?: { start: number; end: number; text: string }[];
      words?: { start: number; end: number; text: string }[];
    };
    if (j.status === "completed") {
      const text = (j.text ?? "").trim();
      if (!text) throw new Error("Empty transcript returned.");
      if (j.utterances?.length) {
        return {
          srt: srtFromSegments(j.utterances.map((u) => ({ start: u.start / 1000, end: u.end / 1000, text: u.text }))),
          text,
        };
      }
      return { srt: srtFromText(text, args.durationSec), text };
    }
    if (j.status === "error") throw new Error(`AssemblyAI: ${j.error ?? "failed"}`);
  }
  throw new Error("AssemblyAI transcription timed out.");
}

async function elevenlabs(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  filename: string;
  language?: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("ElevenLabs API key required.");
  const form = new FormData();
  form.append("model_id", args.model);
  form.append("file", args.blob, args.filename);
  if (args.language) form.append("language_code", args.language);
  form.append("tag_audio_events", "true");
  form.append("diarize", "true");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": args.apiKey },
    body: form,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`ElevenLabs failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const json = (await res.json()) as {
    text?: string;
    words?: { text: string; start: number; end: number; type?: string }[];
  };
  const text = (json.text ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  if (json.words?.length) {
    const segs: { start: number; end: number; text: string }[] = [];
    let cur: { start: number; end: number; words: string[] } | null = null;
    for (const w of json.words) {
      if (w.type && w.type !== "word") continue;
      if (!cur) cur = { start: w.start, end: w.end, words: [w.text] };
      else if (w.end - cur.start > 7) {
        segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
        cur = { start: w.start, end: w.end, words: [w.text] };
      } else {
        cur.end = w.end;
        cur.words.push(w.text);
      }
    }
    if (cur) segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
    return { srt: srtFromSegments(segs), text };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

async function gladia(args: {
  apiKey?: string;
  blob: Blob;
  filename: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {

  if (!args.apiKey) throw new Error("Gladia API key required.");
  const upForm = new FormData();
  upForm.append("audio", args.blob, args.filename);
  const up = await fetch("https://api.gladia.io/v2/upload", {
    method: "POST",
    headers: { "x-gladia-key": args.apiKey },
    body: upForm,
  });
  if (!up.ok) throw new Error(`Gladia upload failed (${up.status})`);
  const { audio_url } = (await up.json()) as { audio_url: string };

  const submit = await fetch("https://api.gladia.io/v2/transcription", {
    method: "POST",
    headers: { "x-gladia-key": args.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url,
      language_config: args.multiLang
        ? { code_switching: true }
        : args.language
          ? { languages: [args.language] }
          : { code_switching: true },

    }),
  });
  if (!submit.ok) throw new Error(`Gladia submit failed (${submit.status})`);
  const { result_url } = (await submit.json()) as { result_url: string };

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const p = await fetch(result_url, { headers: { "x-gladia-key": args.apiKey } });
    const j = (await p.json()) as {
      status: string;
      result?: {
        transcription?: {
          full_transcript?: string;
          utterances?: { start: number; end: number; text: string }[];
        };
      };
    };
    if (j.status === "done") {
      const t = j.result?.transcription;
      const text = (t?.full_transcript ?? "").trim();
      if (!text) throw new Error("Empty transcript returned.");
      if (t?.utterances?.length) {
        return { srt: srtFromSegments(t.utterances.map((u) => ({ start: u.start, end: u.end, text: u.text }))), text };
      }
      return { srt: srtFromText(text, args.durationSec), text };
    }
    if (j.status === "error") throw new Error("Gladia transcription failed.");
  }
  throw new Error("Gladia transcription timed out.");
}

async function speechmatics(args: {
  apiKey?: string;
  blob: Blob;
  filename: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Speechmatics API key required.");
  const form = new FormData();
  form.append("data_file", args.blob, args.filename);
  form.append(
    "config",
    JSON.stringify(
      args.multiLang
        ? {
            type: "transcription",
            // "auto" runs Speechmatics language identification per job.
            transcription_config: { language: "auto", operating_point: "enhanced" },
            language_identification_config: { low_confidence_action: "use_default_language", default_language: args.language || "en" },
          }
        : { type: "transcription", transcription_config: { language: args.language || "en", operating_point: "enhanced" } },
    ),
  );

  const submit = await fetch("https://asr.api.speechmatics.com/v2/jobs", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}` },
    body: form,
  });
  if (!submit.ok) throw new Error(`Speechmatics submit failed (${submit.status})`);
  const { id } = (await submit.json()) as { id: string };

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = (await (await fetch(`https://asr.api.speechmatics.com/v2/jobs/${id}`, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
    })).json()) as { job?: { status: string } };
    if (j.job?.status === "done") {
      const r = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${id}/transcript?format=json-v2`, {
        headers: { Authorization: `Bearer ${args.apiKey}` },
      });
      const t = (await r.json()) as {
        results?: { start_time: number; end_time: number; alternatives?: { content: string }[] }[];
      };
      const words = t.results ?? [];
      const text = words.map((w) => w.alternatives?.[0]?.content ?? "").join(" ").replace(/\s+([.,!?])/g, "$1").trim();
      if (!text) throw new Error("Empty transcript returned.");
      const segs: { start: number; end: number; text: string }[] = [];
      let cur: { start: number; end: number; words: string[] } | null = null;
      for (const w of words) {
        const tx = w.alternatives?.[0]?.content ?? "";
        if (!tx) continue;
        if (!cur) cur = { start: w.start_time, end: w.end_time, words: [tx] };
        else if (w.end_time - cur.start > 7) {
          segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
          cur = { start: w.start_time, end: w.end_time, words: [tx] };
        } else {
          cur.end = w.end_time;
          cur.words.push(tx);
        }
      }
      if (cur) segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
      return { srt: srtFromSegments(segs), text };
    }
    if (j.job?.status === "rejected") throw new Error("Speechmatics rejected the job.");
  }
  throw new Error("Speechmatics transcription timed out.");
}

async function revai(args: {
  apiKey?: string;
  blob: Blob;
  filename: string;
  language?: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Rev.ai API key required.");
  const form = new FormData();
  form.append("media", args.blob, args.filename);
  form.append("options", JSON.stringify({ language: args.language || "en" }));
  const submit = await fetch("https://api.rev.ai/speechtotext/v1/jobs", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}` },
    body: form,
  });
  if (!submit.ok) throw new Error(`Rev.ai submit failed (${submit.status})`);
  const { id } = (await submit.json()) as { id: string };

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = (await (await fetch(`https://api.rev.ai/speechtotext/v1/jobs/${id}`, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
    })).json()) as { status: string };
    if (j.status === "transcribed") {
      const t = (await (await fetch(`https://api.rev.ai/speechtotext/v1/jobs/${id}/transcript`, {
        headers: { Authorization: `Bearer ${args.apiKey}`, Accept: "application/vnd.rev.transcript.v1.0+json" },
      })).json()) as {
        monologues?: { elements: { type: string; value: string; ts?: number; end_ts?: number }[] }[];
      };
      const segs: { start: number; end: number; text: string }[] = [];
      const fullText: string[] = [];
      for (const m of t.monologues ?? []) {
        let cur: { start: number; end: number; words: string[] } | null = null;
        for (const el of m.elements) {
          if (el.type !== "text" || el.ts == null || el.end_ts == null) continue;
          fullText.push(el.value);
          if (!cur) cur = { start: el.ts, end: el.end_ts, words: [el.value] };
          else if (el.end_ts - cur.start > 7) {
            segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
            cur = { start: el.ts, end: el.end_ts, words: [el.value] };
          } else {
            cur.end = el.end_ts;
            cur.words.push(el.value);
          }
        }
        if (cur) segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
      }
      const text = fullText.join(" ").replace(/\s+/g, " ").trim();
      if (!text) throw new Error("Empty transcript returned.");
      return { srt: srtFromSegments(segs), text };
    }
    if (j.status === "failed") throw new Error("Rev.ai transcription failed.");
  }
  throw new Error("Rev.ai transcription timed out.");
}

async function azureSpeech(args: {
  apiKey?: string;
  region?: string;
  blob: Blob;
  mime: string;
  language?: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Azure Speech key required.");
  const region = (args.region || "eastus").replace(/^https?:\/\//, "").split(".")[0];
  const lang = args.language || "en-US";
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(lang)}&format=detailed`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": args.apiKey,
      "Content-Type": args.mime || "audio/wav",
      Accept: "application/json",
    },
    body: args.blob,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Azure Speech failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const j = (await res.json()) as { DisplayText?: string; NBest?: { Display?: string }[] };
  const text = (j.DisplayText ?? j.NBest?.[0]?.Display ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  return { srt: srtFromText(text, args.durationSec), text };
}

async function googleStt(args: {
  apiKey?: string;
  blob: Blob;
  mime: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;

}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Google STT API key required.");
  const buf = new Uint8Array(await args.blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  const encoding =
    ({
      "audio/webm": "WEBM_OPUS",
      "audio/ogg": "OGG_OPUS",
      "audio/mpeg": "MP3",
      "audio/mp3": "MP3",
      "audio/flac": "FLAC",
      "audio/wav": "LINEAR16",
      "audio/x-wav": "LINEAR16",
    } as Record<string, string>)[args.mime.split(";")[0]] ?? "ENCODING_UNSPECIFIED";
  const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(args.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        encoding,
        languageCode: args.language || "en-US",
        // Google STT allows up to 3 alternative languages for code-switched audio.
        ...(args.multiLang ? { alternativeLanguageCodes: ["hi-IN", "ja-JP", "en-US"].filter((c) => c !== (args.language || "en-US")).slice(0, 3) } : {}),
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
      },

      audio: { content: b64 },
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Google STT failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const j = (await res.json()) as {
    results?: {
      alternatives?: { transcript?: string; words?: { startTime?: string; endTime?: string; word?: string }[] }[];
    }[];
  };
  const text = (j.results ?? []).map((r) => r.alternatives?.[0]?.transcript ?? "").join(" ").trim();
  if (!text) throw new Error("Empty transcript returned.");
  const allWords = (j.results ?? []).flatMap((r) => r.alternatives?.[0]?.words ?? []);
  const parseT = (s?: string) => Number((s ?? "0s").replace("s", ""));
  if (allWords.length) {
    const segs: { start: number; end: number; text: string }[] = [];
    let cur: { start: number; end: number; words: string[] } | null = null;
    for (const w of allWords) {
      const s = parseT(w.startTime);
      const e = parseT(w.endTime);
      const tx = w.word ?? "";
      if (!cur) cur = { start: s, end: e, words: [tx] };
      else if (e - cur.start > 7) {
        segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
        cur = { start: s, end: e, words: [tx] };
      } else {
        cur.end = e;
        cur.words.push(tx);
      }
    }
    if (cur) segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
    return { srt: srtFromSegments(segs), text };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

async function replicate(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  mime: string;
  language?: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Replicate API token required.");
  const buf = new Uint8Array(await args.blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const dataUrl = `data:${args.mime};base64,${btoa(bin)}`;
  const submit = await fetch(`https://api.replicate.com/v1/models/${args.model}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { audio: dataUrl, language: args.language, transcription: "srt" } }),
  });
  if (!submit.ok) {
    const msg = await submit.text().catch(() => "");
    throw new Error(`Replicate failed (${submit.status}): ${msg.slice(0, 240)}`);
  }
  let j = (await submit.json()) as { id: string; status: string; output?: unknown; urls?: { get: string } };
  for (let i = 0; i < 90 && j.status !== "succeeded" && j.status !== "failed"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    j = (await (await fetch(j.urls!.get, { headers: { Authorization: `Bearer ${args.apiKey}` } })).json()) as typeof j;
  }
  if (j.status !== "succeeded") throw new Error(`Replicate ${j.status}`);
  const out = j.output as { transcription?: string; segments?: { start: number; end: number; text: string }[] } | string | undefined;
  if (typeof out === "string") {
    return { srt: srtFromText(out, args.durationSec), text: out };
  }
  const text = (out?.transcription ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  if (out?.segments?.length) return { srt: srtFromSegments(out.segments), text };
  return { srt: srtFromText(text, args.durationSec), text };
}



// ============================================================================
// Hugging Face Inference API
// ============================================================================
async function huggingface(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  mime: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Hugging Face token required.");
  const res = await fetch(`https://api-inference.huggingface.co/models/${args.model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": args.mime || "audio/wav",
      Accept: "application/json",
    },
    body: args.blob,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Hugging Face failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const j = (await res.json()) as {
    text?: string;
    chunks?: { timestamp?: [number, number]; text: string }[];
    error?: string;
  };
  if (j.error) throw new Error(`Hugging Face: ${j.error}`);
  const text = (j.text ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  if (j.chunks?.length) {
    const segs = j.chunks
      .filter((c) => c.timestamp && c.timestamp[0] != null && c.timestamp[1] != null)
      .map((c) => ({ start: c.timestamp![0], end: c.timestamp![1], text: c.text.trim() }));
    if (segs.length) return { srt: srtFromSegments(segs), text };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

// ============================================================================
// fal.ai (Whisper / fast Whisper variants)
// ============================================================================
async function falAi(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  mime: string;
  language?: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("fal.ai API key required.");
  const buf = new Uint8Array(await args.blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const dataUrl = `data:${args.mime || "audio/wav"};base64,${btoa(bin)}`;
  const res = await fetch(`https://fal.run/${args.model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: dataUrl,
      task: "transcribe",
      language: args.language,
      chunk_level: "segment",
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`fal.ai failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const j = (await res.json()) as {
    text?: string;
    chunks?: { timestamp?: [number, number]; text: string }[];
  };
  const text = (j.text ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  if (j.chunks?.length) {
    const segs = j.chunks
      .filter((c) => c.timestamp && c.timestamp[0] != null && c.timestamp[1] != null)
      .map((c) => ({ start: c.timestamp![0], end: c.timestamp![1], text: c.text.trim() }));
    if (segs.length) return { srt: srtFromSegments(segs), text };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

// ============================================================================
// Google Gemini Audio (Generative Language API, inline base64)
// ============================================================================
async function geminiAudio(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  mime: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Gemini API key required.");
  const buf = new Uint8Array(await args.blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  const mime = args.mime || "audio/wav";
  const langHint = args.multiLang
    ? "The audio may contain MULTIPLE languages that switch mid-sentence or between scenes (e.g. a Hindi-dubbed film with untranslated English/other-language scenes). Transcribe EVERY spoken line in its ORIGINAL spoken language using that language's native script. Do NOT translate, do NOT skip any dialogue, and do NOT force one language on the whole file."
    : args.language
    ? `The audio is primarily in ${args.language}. Transcribe in that language.`
    : "Detect the spoken language and transcribe in that language. If more than one language is spoken, transcribe each part in its own language and script."
  const prompt = [
    langHint,
    "Transcribe the audio accurately and verbatim.",
    "Preserve the original meaning, tone, emotion, and context of every line.",
    "Do NOT summarize, paraphrase, add, remove, or censor any dialogue (including profanity, slang, or sensitive content).",
    "Maintain proper punctuation, capitalization, and consistent terminology, names, and spellings across the whole transcript.",
    "Use natural sentence breaks so the transcript reads cleanly.",
    "Do NOT add commentary, speaker labels, scene descriptions, sound effects, or timestamps — output the transcript text only.",
  ].join(" ");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${encodeURIComponent(args.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mime, data: b64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Gemini audio failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (j.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Empty transcript returned.");
  return { srt: srtFromText(text, args.durationSec), text };
}

// ============================================================================
// Qwen Audio (Alibaba DashScope, OpenAI-compatible chat with input_audio)
// ============================================================================
async function qwenAudio(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  mime: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("DashScope (Qwen) API key required.");
  const buf = new Uint8Array(await args.blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  const mime = (args.mime || "audio/wav").split(";")[0];
  const fmt =
    ({
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "mp4",
      "audio/x-m4a": "m4a",
      "audio/ogg": "ogg",
      "audio/flac": "flac",
      "audio/webm": "webm",
    } as Record<string, string>)[mime] ?? "wav";
  const dataUrl = `data:${mime};base64,${b64}`;
  const langHint = args.multiLang
    ? "The audio may contain MULTIPLE spoken languages (e.g. a dubbed film with untranslated scenes). Transcribe every line in its original spoken language and native script — do not translate, do not skip any dialogue."
    : args.language
    ? `Audio language: ${args.language}.`
    : "Detect the spoken language. If more than one language is spoken, transcribe each part in its own language and script.";
  const res = await fetch(
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "input_audio", input_audio: { data: dataUrl, format: fmt } },
              { type: "text", text: `${langHint} Transcribe verbatim with natural punctuation. Reply with only the transcript text.` },
            ],
          },
        ],
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Qwen audio failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const j = (await res.json()) as {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
  };
  const raw = j.choices?.[0]?.message?.content;
  const text =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw)
        ? raw.map((p) => p.text ?? "").join("").trim()
        : "";
  if (!text) throw new Error("Empty transcript returned.");
  return { srt: srtFromText(text, args.durationSec), text };
}

// ============================================================================
// AWS Transcribe (SigV4 signed batch job)
// Credentials format (apiKey field): "ACCESS_KEY_ID:SECRET_ACCESS_KEY[:SESSION_TOKEN]"
// Region (url field): e.g. "us-east-1". Optional S3 bucket appended as
// "us-east-1|my-bucket" to override the default upload bucket.
// ============================================================================
async function awsTranscribe(args: {
  apiKey?: string;
  region?: string;
  blob: Blob;
  mime: string;
  fileName: string;
  language?: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) {
    throw new Error(
      'AWS credentials required. Use "ACCESS_KEY_ID:SECRET_ACCESS_KEY" (optionally append ":SESSION_TOKEN") in the API key field.',
    );
  }
  const [accessKeyId, secretAccessKey, sessionToken] = args.apiKey.split(":");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials must be "ACCESS_KEY_ID:SECRET_ACCESS_KEY".');
  }
  const [regionRaw, bucketRaw] = (args.region || "us-east-1").split("|");
  const region = regionRaw.trim() || "us-east-1";
  const bucket = (bucketRaw || "").trim();
  if (!bucket) {
    throw new Error(
      'AWS Transcribe needs an S3 bucket. Put "REGION|BUCKET" in the Endpoint URL field (e.g. "us-east-1|my-transcribe-bucket"). The bucket must allow PutObject + GetObject for the provided credentials.',
    );
  }

  const creds = { accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined };
  const key = `subtitleos/${Date.now()}-${args.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const bodyBuf = new Uint8Array(await args.blob.arrayBuffer());

  // 1) Upload to S3
  await sigv4Fetch({
    method: "PUT",
    url: `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`,
    region,
    service: "s3",
    headers: { "Content-Type": args.mime || "application/octet-stream" },
    body: bodyBuf,
    creds,
  });

  // 2) Start transcription job
  const jobName = `subtitleos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mediaFormat = inferMediaFormat(args.mime, args.fileName);
  const startBody = JSON.stringify({
    TranscriptionJobName: jobName,
    LanguageCode: args.language || "en-US",
    Media: { MediaFileUri: `s3://${bucket}/${key}` },
    MediaFormat: mediaFormat,
    Settings: { ShowSpeakerLabels: false },
  });
  await sigv4Fetch({
    method: "POST",
    url: `https://transcribe.${region}.amazonaws.com/`,
    region,
    service: "transcribe",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "Transcribe.StartTranscriptionJob",
    },
    body: new TextEncoder().encode(startBody),
    creds,
  });

  // 3) Poll
  let transcriptUri = "";
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await sigv4Fetch({
      method: "POST",
      url: `https://transcribe.${region}.amazonaws.com/`,
      region,
      service: "transcribe",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "Transcribe.GetTranscriptionJob",
      },
      body: new TextEncoder().encode(JSON.stringify({ TranscriptionJobName: jobName })),
      creds,
    });
    const j = (await r.json()) as {
      TranscriptionJob?: {
        TranscriptionJobStatus?: string;
        FailureReason?: string;
        Transcript?: { TranscriptFileUri?: string };
      };
    };
    const st = j.TranscriptionJob?.TranscriptionJobStatus;
    if (st === "COMPLETED") {
      transcriptUri = j.TranscriptionJob?.Transcript?.TranscriptFileUri ?? "";
      break;
    }
    if (st === "FAILED") throw new Error(`AWS Transcribe failed: ${j.TranscriptionJob?.FailureReason ?? "unknown"}`);
  }
  if (!transcriptUri) throw new Error("AWS Transcribe timed out.");

  // 4) Fetch transcript JSON (public S3 URL — presigned by Transcribe)
  const tRes = await fetch(transcriptUri);
  if (!tRes.ok) throw new Error(`Fetching AWS transcript failed (${tRes.status})`);
  const tJson = (await tRes.json()) as {
    results?: {
      transcripts?: { transcript: string }[];
      items?: { start_time?: string; end_time?: string; alternatives?: { content: string }[]; type: string }[];
    };
  };
  const text = (tJson.results?.transcripts?.[0]?.transcript ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  const items = tJson.results?.items ?? [];
  if (items.length) {
    const segs: { start: number; end: number; text: string }[] = [];
    let cur: { start: number; end: number; words: string[] } | null = null;
    for (const it of items) {
      const content = it.alternatives?.[0]?.content ?? "";
      if (!content) continue;
      if (it.type === "punctuation") {
        if (cur && cur.words.length) cur.words[cur.words.length - 1] += content;
        continue;
      }
      const s = Number(it.start_time ?? "0");
      const e = Number(it.end_time ?? s);
      if (!cur) cur = { start: s, end: e, words: [content] };
      else if (e - cur.start > 7) {
        segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
        cur = { start: s, end: e, words: [content] };
      } else {
        cur.end = e;
        cur.words.push(content);
      }
    }
    if (cur) segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
    if (segs.length) return { srt: srtFromSegments(segs), text };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

function inferMediaFormat(mime: string, name: string): string {
  const m = (mime || "").split(";")[0];
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "mp4",
    "audio/x-m4a": "mp4",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
  };
  if (map[m]) return map[m];
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (["mp3", "mp4", "wav", "flac", "ogg", "webm", "amr", "m4a"].includes(ext)) {
    return ext === "m4a" ? "mp4" : ext;
  }
  return "mp3";
}

// ----- Minimal AWS SigV4 (Web Crypto) -----
type AwsCreds = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBuf =
    key instanceof Uint8Array
      ? (key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer)
      : key;
  const ck = await crypto.subtle.importKey("raw", keyBuf, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(data));
}

async function sigv4Fetch(opts: {
  method: string;
  url: string;
  region: string;
  service: string;
  headers: Record<string, string>;
  body: Uint8Array;
  creds: AwsCreds;
}): Promise<Response> {
  const u = new URL(opts.url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(opts.body);

  const baseHeaders: Record<string, string> = {
    ...opts.headers,
    host: u.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
  if (opts.creds.sessionToken) baseHeaders["x-amz-security-token"] = opts.creds.sessionToken;

  const sortedKeys = Object.keys(baseHeaders).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders =
    sortedKeys.map((k) => `${k}:${String(baseHeaders[Object.keys(baseHeaders).find((h) => h.toLowerCase() === k)!]).trim()}\n`).join("");
  const signedHeaders = sortedKeys.join(";");
  const canonicalQuery = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    opts.method.toUpperCase(),
    u.pathname || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  const kDate = await hmac(new TextEncoder().encode("AWS4" + opts.creds.secretAccessKey), dateStamp);
  const kRegion = await hmac(kDate, opts.region);
  const kService = await hmac(kRegion, opts.service);
  const kSigning = await hmac(kService, "aws4_request");
  const sigBuf = await hmac(kSigning, stringToSign);
  const signature = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const authorization = `AWS4-HMAC-SHA256 Credential=${opts.creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(opts.url, {
    method: opts.method,
    headers: { ...baseHeaders, Authorization: authorization },
    body: opts.method === "GET" || opts.method === "HEAD" ? undefined : (opts.body as BodyInit),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`AWS ${opts.service} ${opts.method} failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  return res;
}

// ============================================================================
// Soniox (async file transcription API v1)
// ============================================================================
async function soniox(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  filename: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;

}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Soniox API key required.");
  const base = "https://api.soniox.com";
  const headers = { Authorization: `Bearer ${args.apiKey}` };

  // 1) Upload file
  const upForm = new FormData();
  upForm.append("file", args.blob, args.filename);
  const up = await fetch(`${base}/v1/files`, { method: "POST", headers, body: upForm });
  if (!up.ok) throw new Error(`Soniox upload failed (${up.status}): ${(await up.text().catch(() => "")).slice(0, 240)}`);
  const upJ = (await up.json()) as { id: string };

  // 2) Create transcription
  const create = await fetch(`${base}/v1/transcriptions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      file_id: upJ.id,
      model: args.model,
      language_hints: args.multiLang
        ? ["en", "hi", "ja", "es", "ar", "zh"]
        : args.language
          ? [args.language]
          : undefined,

      enable_speaker_diarization: false,
    }),
  });
  if (!create.ok) throw new Error(`Soniox submit failed (${create.status}): ${(await create.text().catch(() => "")).slice(0, 240)}`);
  const { id } = (await create.json()) as { id: string };

  // 3) Poll
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const p = await fetch(`${base}/v1/transcriptions/${id}`, { headers });
    const j = (await p.json()) as { status: string; error_message?: string };
    if (j.status === "completed") break;
    if (j.status === "error" || j.status === "failed") {
      throw new Error(`Soniox: ${j.error_message ?? "failed"}`);
    }
    if (i === 119) throw new Error("Soniox transcription timed out.");
  }

  // 4) Fetch transcript
  const tRes = await fetch(`${base}/v1/transcriptions/${id}/transcript`, { headers });
  if (!tRes.ok) throw new Error(`Soniox transcript fetch failed (${tRes.status})`);
  const tJson = (await tRes.json()) as {
    text?: string;
    tokens?: { text: string; start_ms?: number; end_ms?: number; is_final?: boolean }[];
  };
  const text = (tJson.text ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  const tokens = (tJson.tokens ?? []).filter((t) => t.start_ms != null && t.end_ms != null && t.text.trim());
  if (tokens.length) {
    const segs: Segment[] = [];
    let cur: { start: number; end: number; words: string[] } | null = null;
    for (const t of tokens) {
      const s = (t.start_ms ?? 0) / 1000;
      const e = (t.end_ms ?? s) / 1000;
      if (!cur) cur = { start: s, end: e, words: [t.text] };
      else if (e - cur.start > 7) {
        segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ").replace(/\s+([.,!?])/g, "$1") });
        cur = { start: s, end: e, words: [t.text] };
      } else {
        cur.end = e;
        cur.words.push(t.text);
      }
    }
    if (cur) segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ").replace(/\s+([.,!?])/g, "$1") });
    if (segs.length) return { srt: srtFromSegments(segs), text };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

// ============================================================================
// IBM Watson Speech to Text
// API key field: IAM API key. Endpoint URL field: full instance URL,
// e.g. "https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/<id>".
// ============================================================================
async function ibmWatson(args: {
  apiKey?: string;
  instanceUrl?: string;
  model: string;
  blob: Blob;
  mime: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("IBM Watson API key required.");
  if (!args.instanceUrl) {
    throw new Error('IBM Watson needs an instance URL in the Endpoint URL field (e.g. "https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/<id>").');
  }
  const base = args.instanceUrl.replace(/\/+$/, "");
  const ct = args.mime || "audio/wav";
  const auth = "Basic " + btoa(`apikey:${args.apiKey}`);
  const url = `${base}/v1/recognize?model=${encodeURIComponent(args.model)}&timestamps=true&smart_formatting=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": ct, Accept: "application/json" },
    body: args.blob,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`IBM Watson failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const j = (await res.json()) as {
    results?: {
      alternatives?: {
        transcript?: string;
        timestamps?: [string, number, number][];
      }[];
    }[];
  };
  const transcripts = (j.results ?? []).map((r) => r.alternatives?.[0]?.transcript ?? "");
  const text = transcripts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Empty transcript returned.");
  const stamps = (j.results ?? []).flatMap((r) => r.alternatives?.[0]?.timestamps ?? []);
  if (stamps.length) {
    const segs: Segment[] = [];
    let cur: { start: number; end: number; words: string[] } | null = null;
    for (const [word, s, e] of stamps) {
      if (!cur) cur = { start: s, end: e, words: [word] };
      else if (e - cur.start > 7) {
        segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
        cur = { start: s, end: e, words: [word] };
      } else {
        cur.end = e;
        cur.words.push(word);
      }
    }
    if (cur) segs.push({ start: cur.start, end: cur.end, text: cur.words.join(" ") });
    if (segs.length) return { srt: srtFromSegments(segs), text };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

// ============================================================================
// Yandex SpeechKit (short audio recognition v1)
// API key field: IAM token or Api-Key. Endpoint URL field: folder ID.
// ============================================================================
async function yandexSpeechkit(args: {
  apiKey?: string;
  folderId?: string;
  blob: Blob;
  mime: string;
  language?: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Yandex SpeechKit API key required.");
  if (!args.folderId) {
    throw new Error("Yandex SpeechKit needs your folder ID in the Endpoint URL field.");
  }
  const lang = args.language || "en-US";
  const params = new URLSearchParams({ folderId: args.folderId, lang });
  // Use Api-Key auth (works with service account API keys).
  const auth = args.apiKey.startsWith("t1.") || args.apiKey.length > 100
    ? `Bearer ${args.apiKey}`
    : `Api-Key ${args.apiKey}`;
  const res = await fetch(`https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?${params}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": args.mime || "audio/ogg" },
    body: args.blob,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Yandex SpeechKit failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const j = (await res.json()) as { result?: string; error_message?: string };
  if (j.error_message) throw new Error(`Yandex: ${j.error_message}`);
  const text = (j.result ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  return { srt: srtFromText(text, args.durationSec), text };
}

// ============================================================================
// Local self-hosted servers: WhisperX / Vosk / Coqui STT
// Posts multipart audio to a user-supplied URL. The server is expected to
// return JSON with either { text, segments?: [{start,end,text}] } (WhisperX),
// { text } (Coqui), or { partial?/text } (Vosk). Falls back to plain text.
// ============================================================================
async function localStt(args: {
  providerId: string;
  url?: string;
  apiKey?: string;
  model?: string;
  blob: Blob;
  filename: string;
  mime: string;
  language?: string;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.url) throw new Error(`${args.providerId}: endpoint URL required.`);
  const form = new FormData();
  // Common field names across the three local servers.
  form.append("audio", args.blob, args.filename);
  form.append("file", args.blob, args.filename);
  if (args.language) form.append("language", args.language);
  if (args.model) form.append("model", args.model);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (args.apiKey) headers.Authorization = `Bearer ${args.apiKey}`;

  const res = await fetch(args.url, { method: "POST", headers, body: form });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`${args.providerId} failed (${res.status}): ${msg.slice(0, 240)}`);
  }
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    const txt = (await res.text()).trim();
    if (!txt) throw new Error("Empty transcript returned.");
    return { srt: srtFromText(txt, args.durationSec), text: txt };
  }
  const j = (await res.json()) as {
    text?: string;
    transcript?: string;
    partial?: string;
    result?: string | { text?: string }[];
    segments?: { start: number; end: number; text: string }[];
  };
  let text =
    (typeof j.text === "string" && j.text) ||
    (typeof j.transcript === "string" && j.transcript) ||
    (typeof j.partial === "string" && j.partial) ||
    (typeof j.result === "string" && j.result) ||
    (Array.isArray(j.result) ? j.result.map((r) => r.text ?? "").join(" ") : "") ||
    "";
  text = text.replace(/\s+/g, " ").trim();
  if (!text && !j.segments?.length) throw new Error("Empty transcript returned.");
  if (j.segments?.length) {
    const segs = j.segments
      .filter((s) => typeof s.start === "number" && typeof s.end === "number" && s.text)
      .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
    const joined = text || segs.map((s) => s.text).join(" ").trim();
    if (segs.length) return { srt: srtFromSegments(segs), text: joined };
  }
  return { srt: srtFromText(text, args.durationSec), text };
}

async function runpodWhisper(args: {
  apiKey?: string;
  url: string;
  model: string;
  blob: Blob;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("RunPod API key required.");
  const buf = new Uint8Array(await args.blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  const res = await fetch(args.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: {
        audio_base64: b64,
        model: args.model,
        language: args.language,
        transcription: "srt",
      },
    }),
  });
  if (!res.ok) throw new Error(`RunPod failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 240)}`);
  const json = (await res.json()) as any;
  const out = json.output ?? json;
  const srt = (out.transcription ?? out.srt ?? "").trim();
  const segs = (out.segments ?? []) as { start: number; end: number; text: string }[];
  const text = (out.text ?? segs.map((s) => s.text).join(" ")).trim();
  if (!text && !srt) throw new Error("Empty transcript returned.");
  if (segs.length) return { srt: srtFromSegments(segs), text: text || segs.map((s) => s.text).join(" ") };
  if (srt) return { srt, text: text || srt.replace(/^\d+$|-->|\d\d:\d\d:\d\d,\d{3}/gm, "").trim() };
  return { srt: srtFromText(text, args.durationSec), text };
}

async function cloudflareWhisper(args: {
  apiKey?: string;
  accountId?: string;
  model: string;
  blob: Blob;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Cloudflare API token required.");
  if (!args.accountId) throw new Error("Cloudflare account ID required (URL field).");
  const url = `https://api.cloudflare.com/client/v4/accounts/${args.accountId.trim()}/ai/run/${args.model}`;
  const bytes = new Uint8Array(await args.blob.arrayBuffer());
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Cloudflare Whisper failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 240)}`);
  const json = (await res.json()) as any;
  const r = json.result ?? json;
  const text = (r.text ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  const segs = (r.segments ?? r.words ?? []) as { start?: number; end?: number; text?: string; word?: string }[];
  const mapped = segs
    .map((s) => ({ start: Number(s.start ?? 0), end: Number(s.end ?? 0), text: (s.text ?? s.word ?? "").trim() }))
    .filter((s) => s.text && s.end > s.start);
  if (mapped.length) return { srt: srtFromSegments(mapped), text };
  return { srt: srtFromText(text, args.durationSec), text };
}

async function sarvamStt(args: {
  apiKey?: string;
  model: string;
  blob: Blob;
  filename: string;
  language?: string;
  multiLang?: boolean;
  durationSec: number;
}): Promise<{ srt: string; text: string }> {
  if (!args.apiKey) throw new Error("Sarvam API key required.");
  const form = new FormData();
  form.append("file", args.blob, args.filename);
  form.append("model", args.model);
  // Sarvam auto-detects (and code-switches) when language_code is "unknown".
  if (args.multiLang) form.append("language_code", "unknown");
  else if (args.language) form.append("language_code", args.language);

  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": args.apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`Sarvam failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 240)}`);
  const json = (await res.json()) as { transcript?: string };
  const text = (json.transcript ?? "").trim();
  if (!text) throw new Error("Empty transcript returned.");
  return { srt: srtFromText(text, args.durationSec), text };
}
