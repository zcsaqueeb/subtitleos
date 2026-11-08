import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Upload, Mic, Loader2, Download, Sparkles, Wand2, ShieldCheck, Volume2,
  CheckCircle2, XCircle, Circle, Play, Pause, Square, RotateCw, SkipForward,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { synthesizeDub, cloneVoice, startLipSync, pollLipSync, previewVoice, getDubServices, createLipSyncUpload } from "@/lib/dub.functions";
import { supabase } from "@/lib/supabase-safe";
import { chunkMediaFile } from "@/lib/audio-chunk";
import { LanguagePicker } from "@/components/language-picker";
import { ProviderSettings, useProviderConfig } from "@/components/provider-settings";
import { TranscriptionSettings, useTranscriptionConfig, validateTranscriptionConfig, openTranscriptionSettings } from "@/components/transcription-settings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initializeEncoder, runEncoder } from "@/lib/browser-encoder";
import { downloadText } from "@/lib/subtitle-workflow";
import { mediaExtension } from "@/lib/dubbing-workflow";
import { getUserElevenLabsKey, getUserSyncSoKey } from "@/lib/user-connectors";

export const Route = createFileRoute("/_authenticated/dub/")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Voice Dubbing \u2014 SubtitleOS" },
      { property: "og:description", content: "AI voice dubbing with translation, lip-sync hooks, and optional voice cloning (with consent)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "Voice Dubbing — SubtitleOS" },
      { name: "description", content: "AI voice dubbing with translation, lip-sync hooks, and optional voice cloning (with consent)." },
    ],
  }),
  component: DubPage,
});

type VoiceOption = { value: string; label: string; kind: "openai" | "elevenlabs"; elevenId?: string; note?: string };
type VoiceGroup = { label: string; options: VoiceOption[] };

const VOICE_GROUPS: VoiceGroup[] = [
  {
    label: "Standard (OpenAI TTS)",
    options: [
      "alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer","verse",
    ].map((v) => ({ value: v, label: v, kind: "openai" as const })),
  },
  {
    label: "ElevenLabs — Multilingual (Hindi / Urdu / Arabic / 29 languages)",
    options: [
      { value: "el:JBFqnCBsd6RMkjVDRZzb", label: "George — warm male narrator", kind: "elevenlabs", elevenId: "JBFqnCBsd6RMkjVDRZzb" },
      { value: "el:EXAVITQu4vr4xnSDxMaL", label: "Sarah — soft female narrator", kind: "elevenlabs", elevenId: "EXAVITQu4vr4xnSDxMaL" },
      { value: "el:FGY2WhTYpPnrIDTdsKH5", label: "Laura — upbeat female", kind: "elevenlabs", elevenId: "FGY2WhTYpPnrIDTdsKH5" },
      { value: "el:CwhRBWXzGAHq8TQ4Fs17", label: "Roger — confident male", kind: "elevenlabs", elevenId: "CwhRBWXzGAHq8TQ4Fs17" },
      { value: "el:IKne3meq5aSn9XLyUdCD", label: "Charlie — casual male", kind: "elevenlabs", elevenId: "IKne3meq5aSn9XLyUdCD" },
      { value: "el:N2lVS1w4EtoT3dr4eOWO", label: "Callum — intense male", kind: "elevenlabs", elevenId: "N2lVS1w4EtoT3dr4eOWO" },
      { value: "el:TX3LPaxmHKxFdv7VOQHJ", label: "Liam — articulate male", kind: "elevenlabs", elevenId: "TX3LPaxmHKxFdv7VOQHJ" },
      { value: "el:Xb7hH8MSUJpSbSDYk0k2", label: "Alice — clear female", kind: "elevenlabs", elevenId: "Xb7hH8MSUJpSbSDYk0k2" },
      { value: "el:XrExE9yKIg1WjnnlVkGX", label: "Matilda — friendly female", kind: "elevenlabs", elevenId: "XrExE9yKIg1WjnnlVkGX" },
      { value: "el:bIHbv24MWmeRgasZH58o", label: "Will — young male", kind: "elevenlabs", elevenId: "bIHbv24MWmeRgasZH58o" },
      { value: "el:cgSgspJ2msm6clMCkdW9", label: "Jessica — expressive female", kind: "elevenlabs", elevenId: "cgSgspJ2msm6clMCkdW9" },
      { value: "el:cjVigY5qzO86Huf0OWal", label: "Eric — smooth male", kind: "elevenlabs", elevenId: "cjVigY5qzO86Huf0OWal" },
      { value: "el:iP95p4xoKVk53GoZ742B", label: "Chris — natural male", kind: "elevenlabs", elevenId: "iP95p4xoKVk53GoZ742B" },
      { value: "el:nPczCjzI2devNBz1zQrb", label: "Brian — deep male narrator", kind: "elevenlabs", elevenId: "nPczCjzI2devNBz1zQrb" },
      { value: "el:onwK4e9ZLuTAKqWW03F9", label: "Daniel — British male news", kind: "elevenlabs", elevenId: "onwK4e9ZLuTAKqWW03F9" },
      { value: "el:pFZP5JQG7iQjIQuC4Bku", label: "Lily — warm British female", kind: "elevenlabs", elevenId: "pFZP5JQG7iQjIQuC4Bku" },
      { value: "el:pqHfZKP75CvOlQylNhV4", label: "Bill — mature male", kind: "elevenlabs", elevenId: "pqHfZKP75CvOlQylNhV4" },
      { value: "el:SAz9YHcvj6GT2YYXdXww", label: "River — neutral / non-binary", kind: "elevenlabs", elevenId: "SAz9YHcvj6GT2YYXdXww" },
    ],
  },
  {
    label: "Characters (ElevenLabs)",
    options: [
      { value: "el:MDLAMJ0jxkpYkjXbmG4t", label: "Santa", kind: "elevenlabs", elevenId: "MDLAMJ0jxkpYkjXbmG4t" },
      { value: "el:SAhdygBsjizE9aIj39dz", label: "Mrs Claus", kind: "elevenlabs", elevenId: "SAhdygBsjizE9aIj39dz" },
      { value: "el:h6u4tPKmcPlxUdZOaVpH", label: "The Reindeer", kind: "elevenlabs", elevenId: "h6u4tPKmcPlxUdZOaVpH" },
      { value: "el:e79twtVS2278lVZZQiAD", label: "The Elf", kind: "elevenlabs", elevenId: "e79twtVS2278lVZZQiAD" },
      { value: "el:kPtEHAvRnjUJFv7SK9WI", label: "Glitch", kind: "elevenlabs", elevenId: "kPtEHAvRnjUJFv7SK9WI" },
    ],
  },
];

const ALL_VOICE_OPTIONS: VoiceOption[] = VOICE_GROUPS.flatMap((g) => g.options);
const DEFAULT_VOICE = "alloy";

type StepId = "transcribe" | "translate" | "synth" | "lipsync";
type StepStatus = "pending" | "running" | "done" | "error" | "skipped" | "paused";
type StepState = {
  id: StepId;
  label: string;
  status: StepStatus;
  progress?: string;
  pct?: number;
  error?: string;
};

const STEP_DEFS: Array<{ id: StepId; label: string }> = [
  { id: "transcribe", label: "Transcribe" },
  { id: "translate", label: "Translate" },
  { id: "synth", label: "Re-voice (TTS)" },
  { id: "lipsync", label: "Lip-sync" },
];

type JobSnapshot = {
  fileKey: string;
  transcript: string;
  translated: string;
  audioB64: string;
  audioMime: string;
  steps: StepState[];
  language: string;
};

function freshSteps(): StepState[] {
  return STEP_DEFS.map((s) => ({ id: s.id, label: s.label, status: "pending" }));
}

function DubPage() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en");
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  const [provider, setProvider] = useProviderConfig();

  // Job state
  const [steps, setSteps] = useState<StepState[]>(freshSteps);
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [translated, setTranslated] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioB64, setAudioB64] = useState<string>("");
  const [audioMime, setAudioMime] = useState<string>("audio/mpeg");
  // Muxed output video (when input is a video file)
  const [muxing, setMuxing] = useState(false);
  const [muxProgress, setMuxProgress] = useState(0);
  const [muxedUrl, setMuxedUrl] = useState<string | null>(null);
  const isVideoInput = !!file && (file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name));
  const [sourceUrl, setSourceUrl] = useState("");
  const [operationError, setOperationError] = useState("");
  const [paused, setPaused] = useState(false);
  const previewUrlRef = useRef("");
  const muxEncoderRef = useRef<import("@ffmpeg/ffmpeg").FFmpeg | null>(null);
  const muxAbortRef = useRef<AbortController | null>(null);
  const jobRunningRef = useRef(false);

  // Voice cloning
  const [cloneEnabled, setCloneEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sample, setSample] = useState<File | null>(null);
  const [cloneName, setCloneName] = useState("My voice");
  const [clonedVoiceId, setClonedVoiceId] = useState<string>("");
  const [cloning, setCloning] = useState(false);

  // Lip-sync hook
  const [lipSyncUrl, setLipSyncUrl] = useState("");
  // Built-in Sync.so lip-sync (opt-in, NOT default)
  const [useBuiltInLipSync, setUseBuiltInLipSync] = useState(false);
  const [lipSyncModel, setLipSyncModel] = useState<"lipsync-2" | "lipsync-1.9.0-beta">("lipsync-2");
  const [lipSyncJobId, setLipSyncJobId] = useState<string>("");
  const [lipSyncOutputUrl, setLipSyncOutputUrl] = useState<string>("");

  // Control refs
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sampleRef = useRef<HTMLInputElement>(null);
  // Mirror transcript/translated in refs so sequential pipeline steps
  // read the latest value without waiting for React state to flush.
  const transcriptRef = useRef("");
  const translatedRef = useRef("");
  const audioB64Ref = useRef("");
  const audioMimeRef = useRef("audio/mpeg");
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { translatedRef.current = translated; }, [translated]);
  useEffect(() => { audioB64Ref.current = audioB64; }, [audioB64]);
  useEffect(() => { audioMimeRef.current = audioMime; }, [audioMime]);


  const runTranscribe = useServerFn(transcribeAudio);
  const [sttConfig, setSttConfig] = useTranscriptionConfig();
  const runSynth = useServerFn(synthesizeDub);
  const runClone = useServerFn(cloneVoice);
  const runStartLipSync = useServerFn(startLipSync);
  const runPollLipSync = useServerFn(pollLipSync);
  const runCreateLipSyncUpload = useServerFn(createLipSyncUpload);
  const runPreview = useServerFn(previewVoice);
  const fetchDubServices = useServerFn(getDubServices);

  const [services, setServices] = useState<{ hasElevenLabs: boolean; hasSyncSo: boolean } | null>(null);
  useEffect(() => {
    fetchDubServices().then((s) => setServices(s as any)).catch(() => setServices({ hasElevenLabs: false, hasSyncSo: false }));
  }, [fetchDubServices]);

  const [previewLoading, setPreviewLoading] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  async function handlePreviewVoice() {
    if (previewLoading) return;
    setOperationError(""); setPreviewLoading(true);
    try {
      const selected = ALL_VOICE_OPTIONS.find((o) => o.value === voice);
      const usingClone = cloneEnabled && !!clonedVoiceId;
      const useClonedId = usingClone
        ? clonedVoiceId
        : (selected?.kind === "elevenlabs" ? selected.elevenId : undefined);
      const userElevenKey = getUserElevenLabsKey();
      if (selected?.kind === "elevenlabs" && !services?.hasElevenLabs && !userElevenKey && !usingClone) {
        toast.error("This ElevenLabs voice needs an API key. Add your own in Settings → Connectors.");
        return;
      }
      const res = await runPreview({
        data: {
          voice: selected?.kind === "openai" ? voice : "alloy",
          clonedVoiceId: useClonedId,
          language,
          userElevenLabsKey: userElevenKey,
        },
      });
      const blob = base64ToBlob(res.base64, res.mime);
      const url = URL.createObjectURL(blob);
      if (previewAudioRef.current) {
        try { previewAudioRef.current.pause(); } catch { /* ignore */ }
      }
      const audio = new Audio(url);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      previewAudioRef.current = audio;
      audio.play().catch((err) => toast.error(err?.message ?? "Could not play preview"));
    } catch (e: any) {
      setOperationError(e?.message ?? "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (!file) { setSourceUrl(""); return; }
    const url = URL.createObjectURL(file); setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => { if (muxedUrl) URL.revokeObjectURL(muxedUrl); }, [muxedUrl]);
  useEffect(() => () => {
    cancelRef.current = true; pauseRef.current = false;
    previewAudioRef.current?.pause();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    muxAbortRef.current?.abort(); muxEncoderRef.current?.terminate();
  }, []);

  const fileKey = file ? `dub:${file.name}:${file.size}` : "";

  // Restore previous job snapshot for the picked file
  useEffect(() => {
    if (!fileKey) return;
    try {
      const raw = localStorage.getItem(fileKey);
      if (!raw) { setSteps(freshSteps()); return; }
      const snap = JSON.parse(raw) as JobSnapshot;
      setSteps(snap.steps.map((s) => s.status === "running" ? { ...s, status: "paused" } : s));
      transcriptRef.current = snap.transcript ?? "";
      translatedRef.current = snap.translated ?? "";
      setTranscript(snap.transcript ?? "");
      setTranslated(snap.translated ?? "");

      setLanguage(snap.language || language);
      if (snap.audioB64) {
        setAudioB64(snap.audioB64);
        setAudioMime(snap.audioMime || "audio/mpeg");
        setAudioUrl(URL.createObjectURL(base64ToBlob(snap.audioB64, snap.audioMime || "audio/mpeg")));
      }
    } catch { /* ignore */ }
     
  }, [fileKey]);

  // Persist on changes
  useEffect(() => {
    if (!fileKey) return;
    const snap: JobSnapshot = { fileKey, transcript, translated, audioB64, audioMime, steps, language };
    try { localStorage.setItem(fileKey, JSON.stringify(snap)); } catch { /* quota */ }
  }, [fileKey, transcript, translated, audioB64, audioMime, steps, language]);

  function onPick(f: File | null) {
    if (!f || running || muxing || cloning) return;
    if (!(f.type.startsWith("video/") || f.type.startsWith("audio/") || /\.(mp4|mov|webm|mkv|avi|m4v|mp3|wav|m4a|ogg|flac|aac|opus)$/i.test(f.name))) { setOperationError("Choose a video or audio file."); return; }
    const MAX = 3 * 1024 * 1024 * 1024; // 3 GB / ~3 hours
    if (f.size > MAX) { toast.error("File too large (max 3 GB / ~3 hours)."); return; }
    setSteps(freshSteps()); setTranscript(""); transcriptRef.current = ""; setTranslated(""); translatedRef.current = "";
    setMuxedUrl(null); setLipSyncJobId(""); setLipSyncOutputUrl(""); setOperationError("");
    setFile(f);
    setAudioUrl(null);
    setAudioB64("");
  }

  function updateStep(id: StepId, patch: Partial<StepState>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function waitWhilePaused() {
    while (pauseRef.current && !cancelRef.current) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (cancelRef.current) throw new Error("Canceled");
  }

  async function stepTranscribe() {
    if (!file) throw new Error("No file");
    const cfgErr = validateTranscriptionConfig(sttConfig);
    if (cfgErr) {
      toast.error(cfgErr, { action: { label: "Open settings", onClick: () => openTranscriptionSettings() } });
      throw new Error(cfgErr);
    }
    updateStep("transcribe", { status: "running", progress: "Preparing media…", pct: 0 });
    const { chunks } = await chunkMediaFile(file, { onProgress: (progress) => updateStep("transcribe", { progress }) });
    await waitWhilePaused();
    if (!chunks.length) throw new Error("No decodable audio found.");
    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let combined = "";
    for (let i = 0; i < chunks.length; i++) {
      await waitWhilePaused();
      const c = chunks[i];
      updateStep("transcribe", {
        progress: `Transcribing chunk ${i + 1}/${chunks.length}…`,
        pct: Math.round((i / chunks.length) * 100),
      });
      const b64 = await blobToBase64(c.blob);
      const res = await runTranscribe({
        data: {
          fileName: file.name,
          mime: c.blob.type || file.type || "audio/webm",
          base64: b64,
          durationSec: c.endSec - c.startSec,
          fileId,
          chunkIndex: i,
          providerId: sttConfig.providerId,
          apiKey: sttConfig.apiKey || undefined,
          url: sttConfig.url || undefined,
          model: sttConfig.model || undefined,
        },
      });
      await waitWhilePaused();
      if (!res.text?.trim()) throw new Error(`No speech returned for part ${i + 1}. Completed transcript is preserved.`);
      combined += (combined ? "\n\n" : "") + res.text;
      transcriptRef.current = combined;
      setTranscript(combined);
    }
    if (!combined.trim()) throw new Error("Empty transcript.");
    updateStep("transcribe", { status: "done", progress: `${combined.length} chars`, pct: 100 });
  }

  async function stepTranslateAndSynth() {
    await waitWhilePaused();
    const needsTranslate = language && language !== "en";

    if (needsTranslate) {
      updateStep("translate", { status: "running", progress: `Translating to ${language}…` });
    } else {
      updateStep("translate", { status: "skipped", progress: "Source language" });
    }
    const currentTranscript = transcriptRef.current || transcript;
    if (!currentTranscript.trim()) throw new Error("No transcript available — run Transcribe first.");
    updateStep("synth", { status: "running", progress: "Generating dubbed audio…" });

    const selected = ALL_VOICE_OPTIONS.find((o) => o.value === voice);
    const useClonedId = cloneEnabled && clonedVoiceId
      ? clonedVoiceId
      : (selected?.kind === "elevenlabs" ? selected.elevenId : undefined);
    const res = await runSynth({
      data: {
        text: currentTranscript,
        language,
        sourceLang: "auto",
        voice: selected?.kind === "openai" ? voice : "alloy",
        clonedVoiceId: useClonedId,
        userElevenLabsKey: getUserElevenLabsKey(),
        translateWith: needsTranslate ? {
          providerId: provider.providerId,
          apiKey: provider.apiKey,
          url: provider.url,
          model: provider.model,
          region: provider.region,
          apiVersion: provider.apiVersion,
          folderId: provider.folderId,
        } : undefined,
      },
    });
    await waitWhilePaused();
    setMuxedUrl(null); setLipSyncJobId(""); setLipSyncOutputUrl("");
    const spoken = (res as any).spokenText ?? currentTranscript;
    translatedRef.current = spoken;
    setTranslated(spoken);

    if (needsTranslate) updateStep("translate", { status: "done", progress: `${spoken.length} chars` });
    audioB64Ref.current = res.base64;
    audioMimeRef.current = res.mime;
    setAudioB64(res.base64);
    setAudioMime(res.mime);
    const blob = base64ToBlob(res.base64, res.mime);
    setAudioUrl(URL.createObjectURL(blob));
    updateStep("synth", { status: "done", progress: `via ${res.provider}` });
  }

  async function stepLipSync() {
    // Built-in Sync.so path (opt-in)
    if (useBuiltInLipSync) {
      if (!file) throw new Error("Source video missing");
      const currentAudioB64 = audioB64Ref.current || audioB64;
      const currentAudioMime = audioMimeRef.current || audioMime;
      if (!currentAudioB64) throw new Error("Dubbed audio missing — run Re-voice first");
      let jobId = lipSyncJobId;
      if (!jobId) {
        updateStep("lipsync", { status: "running", progress: "Requesting upload URLs…" });
        const upl = (await runCreateLipSyncUpload({ data: { videoName: file.name } })) as {
          video: { path: string; token: string };
          audio: { path: string; token: string };
        };
        updateStep("lipsync", { status: "running", progress: "Uploading video…" });
        const vUp = await supabase.storage
          .from("lipsync-temp")
          .uploadToSignedUrl(upl.video.path, upl.video.token, file, {
            contentType: file.type || "video/mp4", upsert: true,
          });
        if (vUp.error) throw new Error(`Video upload failed: ${vUp.error.message}`);
        updateStep("lipsync", { status: "running", progress: "Uploading dubbed audio…" });
        const audioBlob = base64ToBlob(currentAudioB64, currentAudioMime);
        const aUp = await supabase.storage
          .from("lipsync-temp")
          .uploadToSignedUrl(upl.audio.path, upl.audio.token, audioBlob, {
            contentType: currentAudioMime, upsert: true,
          });
        if (aUp.error) throw new Error(`Audio upload failed: ${aUp.error.message}`);
        updateStep("lipsync", { status: "running", progress: "Queuing Sync.so…" });
        const start = await runStartLipSync({
          data: {
            videoPath: upl.video.path,
            audioPath: upl.audio.path,
            videoName: file.name,
            model: lipSyncModel,
            userSyncSoKey: getUserSyncSoKey(),
          },
        });
        jobId = (start as any).jobId as string;
        setLipSyncJobId(jobId);
      }
      // Poll loop
      const deadline = Date.now() + 30 * 60 * 1000; // 30 min
      while (Date.now() < deadline) {
        await waitWhilePaused();
        if (cancelRef.current) throw new Error("Cancelled");
        await new Promise((r) => setTimeout(r, 5000));
        await waitWhilePaused();
        const p = (await runPollLipSync({ data: { jobId, userSyncSoKey: getUserSyncSoKey() } })) as { status: string; outputUrl: string | null; error: string | null };
        updateStep("lipsync", { status: "running", progress: `Sync.so: ${p.status}` });
        if (p.status === "COMPLETED" && p.outputUrl) {
          setLipSyncOutputUrl(p.outputUrl);
          updateStep("lipsync", { status: "done", progress: "Rendered" });
          return;
        }
        if (p.status === "FAILED" || p.status === "REJECTED" || p.status === "CANCELED") {
          throw new Error(`Sync.so ${p.status}${p.error ? `: ${p.error}` : ""}`);
        }
      }
      throw new Error("Sync.so render timed out");
    }
    // Webhook hand-off (existing behaviour)
    if (!lipSyncUrl.trim()) {
      updateStep("lipsync", { status: "skipped", progress: "No webhook configured" });
      return;
    }
    updateStep("lipsync", { status: "running", progress: "Posting to webhook…" });
    try {
      const r = await fetch(lipSyncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_mime: audioMime,
          audio_base64: audioB64,
          source_file_name: file?.name,
          language,
        }),
      });
      if (!r.ok) throw new Error(`Webhook ${r.status}`);
      updateStep("lipsync", { status: "done", progress: "Handed off" });
    } catch (e: any) {
      throw new Error(e?.message ?? "Lip-sync webhook failed");
    }
  }

  function bytesToBase64ClientSide(bytes: Uint8Array): string {
    let s = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(s);
  }

  // FileReader-based base64 avoids "Invalid string length" on large videos.
  function fileToBase64(f: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const comma = dataUrl.indexOf(",");
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
      reader.readAsDataURL(f);
    });
  }

  const STEP_FNS: Record<StepId, () => Promise<void>> = {
    transcribe: stepTranscribe,
    translate: stepTranslateAndSynth, // translate+synth share a server call
    synth: async () => { /* handled inside translate */ },
    lipsync: stepLipSync,
  };

  async function runFrom(startIdx: number, force = false) {
    if (!file || jobRunningRef.current) return;
    jobRunningRef.current = true; setOperationError(""); setPaused(false);
    cancelRef.current = false;
    pauseRef.current = false;
    setRunning(true);
    try {
      for (let i = startIdx; i < steps.length; i++) {
        const s = steps[i];
        if (!force && (s.status === "done" || s.status === "skipped")) continue;
        if (s.id === "synth") {
          // Bundled with translate above — mark running for visibility
          continue;
        }
        try {
          await waitWhilePaused();
          await STEP_FNS[s.id]();
        } catch (e: any) {
          const msg = e?.message ?? "Step failed";
          updateStep(s.id, { status: msg === "Canceled" ? "paused" : "error", error: msg });
          if (s.id === "translate") updateStep("synth", { status: msg === "Canceled" ? "paused" : "error", error: msg });
          if (msg === "Canceled") {
            toast.message("Job canceled. Click Resume to continue.");
          } else {
            setOperationError(`${s.label}: ${msg}`);
          }
          return;
        }
      }
      toast.success("Dub complete.");
    } finally {
      setRunning(false); jobRunningRef.current = false; setPaused(false);
      pauseRef.current = false;
    }
  }

  function firstUndoneIndex() {
    const idx = steps.findIndex((s) => s.status !== "done" && s.status !== "skipped");
    return idx < 0 ? steps.length : idx;
  }

  async function handleStart() { await runFrom(0); }
  async function handleResume() { await runFrom(firstUndoneIndex()); }

  function handlePause() {
    if (!running) return;
    pauseRef.current = true; setPaused(true);
    setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "paused", progress: "Paused" } : s)));
    toast.message("Paused. Click Resume to continue.");
  }

  function handleCancel() {
    cancelRef.current = true;
    pauseRef.current = false;
    setSteps((prev) => prev.map((s) => (s.status === "running" || s.status === "paused" ? { ...s, status: "error", error: "Canceled" } : s)));
    setPaused(false);
    toast.message("Stopping after the current request finishes.");
  }

  async function handleRetryStep(id: StepId) {
    if (running) return;
    // reset this and downstream
    const idx = steps.findIndex((s) => s.id === id);
    setSteps((prev) => prev.map((s, i) => (i >= idx ? { ...s, status: "pending", error: undefined, progress: undefined, pct: undefined } : s)));
    await runFrom(id === "synth" ? 1 : idx, true);
  }

  function handleReset() {
    if (running) return;
    setSteps(freshSteps()); setOperationError("");
    setTranscript("");
    setTranslated("");
    transcriptRef.current = ""; translatedRef.current = ""; audioB64Ref.current = "";
    setLipSyncJobId(""); setLipSyncOutputUrl("");
    setAudioB64("");
    setAudioUrl(null);
    if (muxedUrl) { URL.revokeObjectURL(muxedUrl); setMuxedUrl(null); }
    if (fileKey) localStorage.removeItem(fileKey);
  }

  async function muxDubIntoVideo() {
    if (muxing || running) return;
    const abort = new AbortController(); muxAbortRef.current = abort;
    let encoder: import("@ffmpeg/ffmpeg").FFmpeg | undefined;
    setOperationError("");
    if (!file || !audioB64) { toast.error("Need a source video and dubbed audio."); return; }
    if (!isVideoInput) { toast.error("Source is audio-only — no video to mux."); return; }
    try {
      setMuxing(true);
      setMuxProgress(0);
      if (muxedUrl) { URL.revokeObjectURL(muxedUrl); setMuxedUrl(null); }
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile } = await import("@ffmpeg/util");
      const ff = new FFmpeg(); encoder = ff; muxEncoderRef.current = ff;
      ff.on("progress", ({ progress }) => setMuxProgress(Math.round(Math.max(0, Math.min(1, progress)) * 100)));
      await initializeEncoder(ff, abort.signal);
      if (abort.signal.aborted) throw new Error("Cancelled");
      const inExt = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4").toLowerCase();
      const inName = `in${inExt}`;
      const audExt = mediaExtension(audioMime);
      const audName = `dub.${audExt}`;
      await ff.writeFile(inName, await fetchFile(file));
      await ff.writeFile(audName, await fetchFile(base64ToBlob(audioB64, audioMime)));
      const outName = "out.mp4";
      // Copy video stream; replace audio with the dubbed track.
      await runEncoder(ff, [
        "-i", inName,
        "-i", audName,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:a", "aac",
        "-b:a", "192k",
        "-af", "apad", "-shortest",
        "-movflags", "+faststart",
        outName,
      ]);
      if (abort.signal.aborted) throw new Error("Cancelled");
      const data = await ff.readFile(outName);
      const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
      setMuxedUrl(URL.createObjectURL(blob));
      toast.success("Dubbed video ready.");
    } catch (e: any) {
      if (!abort.signal.aborted) setOperationError(`Video export failed: ${e?.message ?? e}`);
    } finally {
      encoder?.terminate(); muxEncoderRef.current = null; muxAbortRef.current = null;
      setMuxing(false);
    }
  }

  async function handleClone() {
    if (!sample) { toast.error("Pick a 10-60s voice sample (wav/mp3/m4a)."); return; }
    if (!consent) { toast.error("You must consent to clone your voice."); return; }
    try {
      setCloning(true);
      const b64 = await blobToBase64(sample);
      const res = await runClone({
        data: { name: cloneName || "My voice", sampleBase64: b64, sampleMime: sample.type || "audio/mpeg", consent: true, userElevenLabsKey: getUserElevenLabsKey() },
      });
      setClonedVoiceId(res.voiceId);
      toast.success("Voice clone ready.");
    } catch (e: any) {
      toast.error(e?.message ?? "Voice cloning failed.");
    } finally {
      setCloning(false);
    }
  }

  const hasError = steps.some((s) => s.status === "error");
  const isPaused = steps.some((s) => s.status === "paused");

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Mic className="size-6 text-primary" />Voice Dubbing</h1>
          <Button variant="outline" asChild><Link to="/dub/projects">Multi-Character Studio</Link></Button>
        </header>
        {operationError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm break-words">{operationError}<Button variant="outline" onClick={() => setOperationError("")} className="ml-2">Dismiss</Button></div>}
        <section className="border-t border-border py-5 space-y-4">
          <div
            onClick={() => { if (!running && !muxing) inputRef.current?.click(); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files?.[0] ?? null); }}
            className="cursor-pointer rounded-xl border-2 border-dashed border-border p-8 text-center hover:bg-muted/40"
          >
            <Upload className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm">
              {file ? <span className="break-words font-medium">{file.name}</span> : "Drop a video or audio file, or click to browse (max 3 GB / ~3 hours)"}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="video/*,audio/*"
              aria-label="Upload dubbing media" disabled={running || muxing} className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
          </div>

          {sourceUrl && (isVideoInput ? <video aria-label="Source video preview" src={sourceUrl} controls playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-ink object-contain" /> : <audio aria-label="Source audio preview" src={sourceUrl} controls preload="metadata" className="w-full" />)}
          <fieldset disabled={running || muxing} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-muted-foreground">Target language</span>
              <LanguagePicker value={language} onChange={setLanguage} className="w-full" />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">Dub voice</span>
              <div className="flex items-center gap-2">
                <select
                  disabled={cloneEnabled && !!clonedVoiceId}
                  value={voice}
                  onChange={(e) => setVoice(e.target.value as any)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 disabled:opacity-50"
                >
                  {VOICE_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                <Button variant="outline"
                  type="button"
                  onClick={handlePreviewVoice}
                  disabled={previewLoading}
                  title="Play a short sample so you can hear the accent"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Preview
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Hear a ~1-line sample before rendering.</p>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ProviderSettings config={provider} onChange={setProvider} />
            <TranscriptionSettings config={sttConfig} onChange={setSttConfig} />
          </div>

          {/* Voice cloning */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <input type="checkbox" checked={cloneEnabled} onChange={(e) => setCloneEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
              <Volume2 className="h-4 w-4" /> Use voice cloning (ElevenLabs)
            </label>
            {services && !services.hasElevenLabs && !getUserElevenLabsKey() && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Voice cloning needs an ElevenLabs API key. Add your own in Settings → Connectors.
              </div>
            )}
            {cloneEnabled && (
              <div className="space-y-3 pl-6">
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span className="flex items-start gap-1">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    I confirm the voice in the sample is mine (or I have written permission from the speaker) and I consent to creating a voice clone.
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="Voice name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
                  <input ref={sampleRef} type="file" accept="audio/*" onChange={(e) => setSample(e.target.files?.[0] ?? null)} className="text-xs" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={handleClone} disabled={!sample || !consent || cloning} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">
                    {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                    {cloning ? "Cloning…" : "Create voice clone"}
                  </Button>
                  {clonedVoiceId && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                      Clone ready · {clonedVoiceId.slice(0, 8)}…
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Lip-sync */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <input
                id="builtin-lipsync"
                type="checkbox"
                checked={useBuiltInLipSync}
                onChange={(e) => setUseBuiltInLipSync(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="builtin-lipsync" className="text-sm">
                <span className="font-medium">🎬 Built-in lip-sync (Sync.so)</span>
                <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600">Opt-in · costs credits</span>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Renders the dubbed audio over the source video using Sync.so's lipsync model. Source video ≤ 5 min.
                </p>
              </label>
            </div>
            {useBuiltInLipSync && (
              <div className="ml-6 space-y-2">
                <label className="text-xs font-medium block">Model</label>
                <select
                  value={lipSyncModel}
                  onChange={(e) => setLipSyncModel(e.target.value as any)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="lipsync-2">lipsync-2 (recommended)</option>
                  <option value="lipsync-1.9.0-beta">lipsync-1.9.0-beta</option>
                </select>
                {lipSyncJobId && (
                  <p className="text-[11px] text-muted-foreground">Job: {lipSyncJobId.slice(0, 12)}…</p>
                )}
                {lipSyncOutputUrl && (
                  <div className="space-y-1">
                    <video src={lipSyncOutputUrl} controls className="w-full rounded-md border border-border" />
                    <a href={lipSyncOutputUrl} download className="text-xs underline">Download rendered MP4</a>
                  </div>
                )}
              </div>
            )}
            <div className="pt-2 border-t border-border/50">
              <label className="text-sm font-medium">Or hand off to your own renderer (webhook)</label>
              <input value={lipSyncUrl} onChange={(e) => setLipSyncUrl(e.target.value)} placeholder="https://your-lipsync-service.example.com/render" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Ignored when built-in lip-sync is enabled. Otherwise POSTs the dubbed audio (base64) + source filename to your URL.
              </p>
            </div>
          </div>

          </fieldset>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {!running && !isPaused && !hasError && firstUndoneIndex() === 0 && (
              <Button variant="outline" onClick={handleStart} disabled={!file} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                <Wand2 className="h-4 w-4" /> Dub it
              </Button>
            )}
            {!running && (isPaused || hasError || (firstUndoneIndex() > 0 && firstUndoneIndex() < steps.length)) && (
              <Button variant="outline" onClick={handleResume} disabled={!file} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                <Play className="h-4 w-4" /> Resume
              </Button>
            )}
            {running && (
              <>
                {paused ? <Button variant="outline" onClick={() => { pauseRef.current = false; setPaused(false); }}>
                  <Play />Continue
                </Button> : <Button variant="outline" onClick={handlePause} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Pause className="h-4 w-4" /> Pause
                </Button>}
                <Button variant="outline" onClick={handleCancel} className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
                  <Square className="h-4 w-4" /> Cancel
                </Button>
              </>
            )}
            {!running && (
              <Button variant="outline" onClick={handleReset} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <RotateCw className="h-4 w-4" /> Reset
              </Button>
            )}
            {audioUrl && (
              <a href={audioUrl} download={`${(file?.name ?? "dub").replace(/\.[^.]+$/, "")}.${language}.${mediaExtension(audioMime)}`} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Download className="h-4 w-4" /> Download dub
              </a>
            )}
            {transcript && <Button variant="outline" onClick={() => downloadText(transcript, `${file?.name.replace(/\.[^.]+$/, "") ?? "dub"}.transcript.txt`)}><Download />Transcript TXT</Button>}
            {translated && <Button variant="outline" onClick={() => downloadText(translated, `${file?.name.replace(/\.[^.]+$/, "") ?? "dub"}.${language}.txt`)}><Download />Translation TXT</Button>}
            {isVideoInput && audioUrl && !muxedUrl && !muxing && (
              <Button variant="outline" onClick={muxDubIntoVideo} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Wand2 className="h-4 w-4" /> Export dubbed video
              </Button>
            )}
            {muxing && (
              <span className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Muxing video… {muxProgress}%
              </span>
            )}
            {muxing && <Button variant="outline" onClick={() => { muxAbortRef.current?.abort(); muxEncoderRef.current?.terminate(); }}><Square />Cancel export</Button>}
            {muxedUrl && (
              <a href={muxedUrl} download={`${(file?.name ?? "dub").replace(/\.[^.]+$/, "")}.${language}.mp4`} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Download className="h-4 w-4" /> Download dubbed video
              </a>
            )}
            {lipSyncOutputUrl && (
              <a href={lipSyncOutputUrl} download className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Download className="h-4 w-4" /> Lip-synced MP4
              </a>
            )}
          </div>
        </section>

        {/* Job progress */}
        <section className="border-t border-border py-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Job progress</h2>
            {(() => {
              const total = steps.length || 1;
              const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
              const overall = Math.round((done / total) * 100);
              return (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {done}/{total} · {overall}%{running ? " · running" : ""}
                </span>
              );
            })()}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gold transition-all"
              style={{ width: `${Math.round((steps.filter((s) => s.status === "done" || s.status === "skipped").length / (steps.length || 1)) * 100)}%` }} />
          </div>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                <StepIcon status={s.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {i + 1}. {s.label}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  {s.progress && <div className="mt-0.5 text-xs text-muted-foreground truncate">{s.progress}</div>}
                  {typeof s.pct === "number" && s.status === "running" && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${s.pct}%` }} />
                    </div>
                  )}
                  {s.error && s.status === "error" && (
                    <div className="mt-1 text-xs text-destructive">{s.error}</div>
                  )}
                </div>
                {!running && (s.status === "error" || s.status === "paused" || s.status === "done") && (
                  <div className="flex gap-1">
                    {(s.status === "error" || s.status === "paused" || s.status === "done") && (
                      <Button variant="outline" onClick={() => handleRetryStep(s.id)} title="Re-run this step (and downstream)" className="rounded-md border border-border p-1.5 text-xs hover:bg-muted">
                        <RotateCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {s.status === "error" && (
                      <Button variant="outline" onClick={() => updateStep(s.id, { status: "skipped", error: undefined, progress: "Skipped" })} title="Skip this step" className="rounded-md border border-border p-1.5 text-xs hover:bg-muted">
                        <SkipForward className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        {(audioUrl || muxedUrl) && (
          <section className="border-t border-border py-5 space-y-3">
            <h2 className="text-lg font-semibold">Preview</h2>
            {muxedUrl ? (
              <video controls src={muxedUrl} className="w-full rounded-md border border-border" />
            ) : audioUrl ? (
              <audio controls src={audioUrl} className="w-full" />
            ) : null}
          </section>
        )}

        {(transcript || translated) && (
          <details className="border-t border-border py-5">
            <summary className="cursor-pointer text-sm font-medium">Show transcript & translation</summary>
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              {transcript && (
                <div>
                  <div className="mb-1 font-medium text-foreground">Source transcript</div>
                  <Textarea aria-label="Edit source transcript" value={transcript} disabled={running || muxing} onChange={(e) => { setTranscript(e.target.value); transcriptRef.current = e.target.value; setAudioUrl(null); setAudioB64(""); setMuxedUrl(null); setSteps((prev) => prev.map((step) => step.id === "transcribe" ? { ...step, status: "done" } : { ...step, status: "pending", error: undefined })); }} rows={8} dir="auto" />
                </div>
              )}
              {translated && translated !== transcript && (
                <div>
                  <div className="mb-1 font-medium text-foreground">Translated ({language})</div>
                  <pre className="whitespace-pre-wrap break-words">{translated}</pre>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </AppShell>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />;
  if (status === "error") return <XCircle className="h-5 w-5 text-destructive shrink-0" />;
  if (status === "running") return <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />;
  if (status === "paused") return <Pause className="h-5 w-5 text-amber-500 shrink-0" />;
  if (status === "skipped") return <SkipForward className="h-5 w-5 text-muted-foreground shrink-0" />;
  return <Circle className="h-5 w-5 text-muted-foreground/60 shrink-0" />;
}

function StatusBadge({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-primary/15 text-primary",
    done: "bg-emerald-500/15 text-emerald-600",
    error: "bg-destructive/15 text-destructive",
    skipped: "bg-muted text-muted-foreground",
    paused: "bg-amber-500/15 text-amber-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[status]}`}>{status}</span>;
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = await b.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: mime });
}
