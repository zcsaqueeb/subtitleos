import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Mic, FileVideo, Loader2, Download, Sparkles, Languages, Play, Pause, Square, Bitcoin, Smartphone, History, Trash2, RotateCcw, Save, Check, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalDraft, isConnectionError } from "@/lib/local-draft";
import { subtitleExport, downloadText } from "@/lib/subtitle-workflow";
import { AppShell } from "@/components/app-shell";
import { TranscriptionSettings, useTranscriptionConfig, validateTranscriptionConfig, openTranscriptionSettings } from "@/components/transcription-settings";
import { ProviderSettings, useProviderConfig } from "@/components/provider-settings";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { translateSubtitles, polishSrt } from "@/lib/translate.functions";
import { LANGUAGES } from "@/lib/translation/languages";
import { LanguagePicker } from "@/components/language-picker";
import { chunkMediaFile, parseSrtCues, shiftSrt } from "@/lib/audio-chunk";
import { detectCueLangs, detectLangChanges, type LangCue } from "@/lib/detect-lang";
import { SubtitleStylerButton, useSubtitleStyle, subtitleCssVars, subtitleAnimClass } from "@/components/subtitle-styler";
import { ChunkDiagnostics, type ChunkDiag } from "@/components/chunk-diagnostics";
import {
  listHistory,
  saveEntry,
  deleteEntry,
  clearHistory,
  type TranscriptEntry,
  type TranscriptStatus,
} from "@/lib/transcript-history";


export const Route = createFileRoute("/_authenticated/transcribe")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Transcribe video & audio \u2192 SRT \u2014 SubtitleOS" },
      { property: "og:description", content: "Upload a video or audio file (up to 3 GB / ~3 hours) with live preview, pick any STT provider, translate, AI-clean, and download SRT/VTT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "Transcribe video & audio → SRT — SubtitleOS" },
      { name: "description", content: "Upload a video or audio file (up to 3 GB / ~3 hours) with live preview, pick any STT provider, translate, AI-clean, and download SRT/VTT." },
    ],
  }),
  component: TranscribePage,
});

const VIDEO_RX = /\.(mp4|webm|mov|m4v|mkv|avi)$/i;
const AUDIO_RX = /\.(mp3|wav|m4a|ogg|flac|aac|webm|opus)$/i;
const MAX_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB / ~3 hours

function srtToVtt(srt: string): string {
  return "WEBVTT\n\n" + srt.replace(/,(\d{3})/g, ".$1");
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtSrtTime(sec: number) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  const mmm = String(ms % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}

function cuesToSrt(cues: { start: number; end: number; text: string }[]) {
  return cues
    .map((c, i) => `${i + 1}\n${fmtSrtTime(c.start)} --> ${fmtSrtTime(c.end)}\n${c.text}`)
    .join("\n\n");
}

function fmtRelative(ms: number) {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TranscribePage() {
  const [file, setFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [isVideo, setIsVideo] = useState(false);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("");
  const [busy, setBusy] = useState<null | "transcribe" | "translate" | "polish">(null);
  const [progress, setProgress] = useState<string>("");
  const [srt, setSrt] = useState<string>("");
  const latestSrtRef = useRef("");
  const [operationError, setOperationError] = useState("");
  const [originalSrt, setOriginalSrt] = useState("");
  useEffect(() => { latestSrtRef.current = srt; }, [srt]);
  useEffect(() => () => { stoppedRef.current = true; pausedRef.current = false; }, []);
  const [outName, setOutName] = useState<string>("");
  const [subStyle, setSubStyle] = useSubtitleStyle();
  const [currentTime, setCurrentTime] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [sttConfig, setSttConfig] = useTranscriptionConfig();
  const [mtConfig, setMtConfig] = useProviderConfig();
  const [interrupted, setInterrupted] = useState<null | "transcribe" | "translate">(null);
  const draft = useLocalDraft("transcribe", { srt, originalSrt, outName, sourceLang, targetLang }, (d) => {
    if (d.srt) { setSrt(d.srt); toast.success("Restored your saved transcript edits"); }
    if (typeof d.originalSrt === "string") setOriginalSrt(d.originalSrt);
    if (d.outName) setOutName(d.outName);
    if (d.sourceLang) setSourceLang(d.sourceLang);
    if (typeof d.targetLang === "string") setTargetLang(d.targetLang);
  }, busy !== "transcribe");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const stoppedRef = useRef(false);

  // Per-chunk diagnostics (status, provider/model, retry history).
  const [diag, setDiag] = useState<ChunkDiag[]>([]);
  const retryChunkRef = useRef<((index: number) => void) | null>(null);
  const patchDiag = useCallback((index: number, patch: Partial<ChunkDiag>) => {
    setDiag((prev) => prev.map((c) => (c.index === index ? { ...c, ...patch } : c)));
  }, []);
  const pushAttempt = useCallback(
    (index: number, attempt: NonNullable<ChunkDiag["attempts"]>[number], patch?: Partial<ChunkDiag>) => {
      setDiag((prev) =>
        prev.map((c) => (c.index === index ? { ...c, ...patch, attempts: [...c.attempts, attempt] } : c)),
      );
    },
    [],
  );


  // Local transcript history (localStorage-backed).
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  useEffect(() => setHistory(listHistory()), []);
  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | TranscriptStatus>("all");
  const currentIdRef = useRef<string | null>(null);
  const currentMetaRef = useRef<{ createdAt: number } | null>(null);

  const refreshHistory = useCallback(() => setHistory(listHistory()), []);

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return history.filter((h) => {
      if (historyStatus !== "all" && h.status !== historyStatus) return false;
      if (!q) return true;
      return (
        h.name.toLowerCase().includes(q) ||
        (h.sourceFileName ?? "").toLowerCase().includes(q) ||
        (h.srt ?? "").toLowerCase().includes(q)
      );
    });
  }, [history, historyQuery, historyStatus]);

  const persistCurrent = useCallback(
    (patch: Partial<TranscriptEntry> & { status: TranscriptStatus; srt: string }) => {
      const id = currentIdRef.current;
      if (!id) return;
      const createdAt = currentMetaRef.current?.createdAt ?? Date.now();
      const entry: TranscriptEntry = {
        id,
        name: patch.name ?? outName ?? "transcript.srt",
        sourceFileName: patch.sourceFileName ?? file?.name,
        sourceLang: patch.sourceLang ?? sourceLang,
        targetLang: patch.targetLang ?? targetLang,
        providerId: patch.providerId ?? sttConfig.providerId,
        status: patch.status,
        createdAt,
        updatedAt: Date.now(),
        durationSec: patch.durationSec,
        chunks: patch.chunks,
        srt: patch.srt,
        error: patch.error,
      };
      saveEntry(entry);
      refreshHistory();
    },
    [file, outName, refreshHistory, sourceLang, sttConfig.providerId, targetLang],
  );


  const transcribeFn = useServerFn(transcribeAudio);
  const translateFn = useServerFn(translateSubtitles);
  const polishFn = useServerFn(polishSrt);


  const cues = useMemo(() => parseSrtCues(srt), [srt]);
  const langCues = useMemo(() => detectCueLangs(cues), [cues]);
  const langMarkers = useMemo(() => detectLangChanges(langCues), [langCues]);
  const activeCueIdx = useMemo(
    () => cues.findIndex((c) => currentTime >= c.start && currentTime <= c.end),
    [cues, currentTime],
  );

  useEffect(() => () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); }, [mediaUrl]);

  function pickFile(f: File) {
    if (busy) return;
    retryChunkRef.current = null;
    setDiag([]); setOperationError(""); setOriginalSrt(""); setCurrentTime(0);
    const ok = VIDEO_RX.test(f.name) || AUDIO_RX.test(f.name) || f.type.startsWith("audio/") || f.type.startsWith("video/");
    if (!ok) return toast.error("Unsupported format. Use MP4/WebM/MOV/MKV/AVI or MP3/WAV/M4A/OGG/FLAC/AAC.");
    if (f.size > MAX_BYTES) return toast.error("Max 3 GB / ~3 hours. Trim the file and try again.");
    setFile(f); setSrt(""); setOutName(f.name.replace(/\.[^.]+$/, "") + ".srt");
    const url = URL.createObjectURL(f);
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMediaUrl(url);
    setIsVideo(VIDEO_RX.test(f.name) || f.type.startsWith("video/"));
  }

  function bytesToB64(bytes: Uint8Array): string {
    let bin = ""; const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    return btoa(bin);
  }

  async function waitWhilePaused() {
    while (pausedRef.current && !stoppedRef.current) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async function runTranscribe() {
    if (!file || busy) return;
    const cfgErr = validateTranscriptionConfig(sttConfig);
    if (cfgErr) {
      toast.error(cfgErr, { action: { label: "Open settings", onClick: () => openTranscriptionSettings() } });
      return;
    }
    stoppedRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setOperationError(""); setOriginalSrt(""); latestSrtRef.current = "";
    setBusy("transcribe"); setProgress("Preparing audio…"); setSrt(""); setDiag([]);
    // Stable per-file id — server uses this to count chunked uploads as ONE file.
    const fileId =
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    // Start a new history entry for this run.
    currentIdRef.current = fileId;
    currentMetaRef.current = { createdAt: Date.now() };
    persistCurrent({ status: "running", srt: "", chunks: { done: 0, total: 0 } });
    try {
      // 180 s target chunks with silence-snapped boundaries: cuts land in
      // low-energy windows so we never split a word — timing stays accurate
      // end-to-end without needing overlap/dedup between chunks.
      const { chunks, durationSec } = await chunkMediaFile(file, {
        chunkSeconds: 180,
        onProgress: setProgress,
      });

      // Seed diagnostics rows so every chunk is visible before it runs.
      setDiag(
        chunks.map((ch) => ({
          index: ch.index,
          startSec: ch.startSec,
          endSec: ch.endSec,
          bytes: ch.blob.size,
          status: "queued" as const,
          providerId: sttConfig.providerId,
          model: sttConfig.model || undefined,
          attempts: [],
        })),
      );

      // Parallel transcription (up to 3 in flight) — chops wall-clock time
      // roughly by the concurrency factor without breaking pause/stop, since
      // we `waitWhilePaused()` before scheduling each new chunk. Cues are
      // merged in chunk order regardless of completion order.
      const CONCURRENCY = 3;
      const results = new Array<string | null>(chunks.length).fill(null);
      let inFlight = 0;
      let nextToSchedule = 0;
      let done = 0;
      let firstError: unknown = null;

      const runOne = async (ch: (typeof chunks)[number]): Promise<void> => {
        const chunkStarted = Date.now();
        patchDiag(ch.index, {
          status: "running",
          error: undefined,
          providerId: sttConfig.providerId,
          model: sttConfig.model || undefined,
        });
        const bytes = new Uint8Array(await ch.blob.arrayBuffer());
        const base64 = bytesToB64(bytes);
        let res: { srt: string; text: string } | null = null;
        let lastErr: unknown = null;
        const MAX_ATTEMPTS = 6;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (stoppedRef.current) throw new Error("Stopped");
          await waitWhilePaused();
          const attemptStarted = Date.now();
          try {
            res = await transcribeFn({
              data: {
                fileName: `chunk-${ch.index}.wav`,
                mime: "audio/wav",
                base64,
                durationSec: ch.endSec - ch.startSec,
                language: sourceLang === "auto" ? undefined : sourceLang,
                providerId: sttConfig.providerId,
                apiKey: sttConfig.apiKey || undefined,
                url: sttConfig.url || undefined,
                model: sttConfig.model || undefined,
                fileId,
                chunkIndex: ch.index,
              },
            });
            pushAttempt(ch.index, { attempt: attempt + 1, at: attemptStarted, ok: true, ms: Date.now() - attemptStarted });
            break;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            const offline = typeof navigator !== "undefined" && navigator.onLine === false;
            const rateLimited = /429|rate.?limit|too many requests/i.test(msg);
            const retriable =
              offline || rateLimited ||
              /failed to fetch|network|timeout|fetch failed|5\d\d|ECONN|ETIMEDOUT|load failed|aborted|socket/i.test(msg);
            if (!retriable || attempt === MAX_ATTEMPTS - 1) {
              pushAttempt(
                ch.index,
                { attempt: attempt + 1, at: attemptStarted, ok: false, error: msg, reason: retriable ? "retries exhausted" : "non-retriable", ms: Date.now() - attemptStarted },
                { status: /^stopped$/i.test(msg) ? "skipped" : "failed", error: msg, ms: Date.now() - chunkStarted },
              );
              throw err;
            }

            // If the browser is offline, wait for connectivity instead of
            // burning retries against a dead network.
            if (offline) {
              pushAttempt(
                ch.index,
                { attempt: attempt + 1, at: attemptStarted, ok: false, error: msg, reason: "offline", ms: Date.now() - attemptStarted },
                { status: "retrying" },
              );
              setProgress(`Chunk ${ch.index + 1}/${chunks.length} — offline, waiting for your connection…`);
              const backOnline = await new Promise<boolean>((resolve) => {
                const onUp = () => { cleanup(); resolve(true); };
                const timer = setInterval(() => {
                  if (stoppedRef.current) { cleanup(); resolve(false); }
                  else if (navigator.onLine) { cleanup(); resolve(true); }
                }, 1000);
                const cleanup = () => { clearInterval(timer); window.removeEventListener("online", onUp); };
                window.addEventListener("online", onUp);
              });
              if (!backOnline) { patchDiag(ch.index, { status: "skipped", error: "Stopped" }); throw new Error("Stopped"); }
              continue;
            }

            // Exponential backoff + jitter (rate limits get a longer floor).
            const base = rateLimited ? 4000 : 1200;
            const wait = Math.min(30_000, base * Math.pow(2, attempt)) + Math.floor(Math.random() * 700);
            const reason = rateLimited ? "provider rate limit" : "network hiccup";
            pushAttempt(
              ch.index,
              { attempt: attempt + 1, at: attemptStarted, ok: false, error: msg, reason, waitMs: wait, ms: Date.now() - attemptStarted },
              { status: "retrying" },
            );
            setProgress(
              `Chunk ${ch.index + 1}/${chunks.length} — ${reason}, retry ${attempt + 1}/${MAX_ATTEMPTS - 1} in ${Math.round(wait / 1000)}s…`,
            );
            const until = Date.now() + wait;
            while (Date.now() < until) {
              if (stoppedRef.current) { patchDiag(ch.index, { status: "skipped", error: "Stopped" }); throw new Error("Stopped"); }
              await new Promise((r) => setTimeout(r, 250));
            }
          }
        }

        if (!res) throw (lastErr instanceof Error ? lastErr : new Error("Transcription failed"));
        if (results[ch.index] === null) done++;
        results[ch.index] = res.srt;
        // Rebuild merged SRT from all completed chunks so live preview stays
        // in chunk order even when a later chunk finishes first.
        let merged = ""; let cueNum = 1;
        for (let i = 0; i < results.length; i++) {
          const s = results[i];
          if (!s) continue;
          const shifted = shiftSrt(s, chunks[i].startSec, cueNum, chunks[i].endSec - chunks[i].startSec);
          merged = merged ? merged + "\n\n" + shifted.srt : shifted.srt;
          cueNum = shifted.nextCueNumber;
        }
        patchDiag(ch.index, {
          status: "done",
          error: undefined,
          ms: Date.now() - chunkStarted,
          cues: parseSrtCues(res.srt).length,
        });
        latestSrtRef.current = merged;
        setSrt(merged);
        persistCurrent({
          status: pausedRef.current ? "paused" : "running",
          srt: merged,
          chunks: { done, total: chunks.length },
          durationSec,
        });
        setProgress(`Transcribed ${done}/${chunks.length} chunks…`);
      };

      // Allow one-click retry of a single failed chunk from the diagnostics panel.
      retryChunkRef.current = (index: number) => {
        const ch = chunks[index];
        if (!ch) return;
        stoppedRef.current = false;
        setBusy("transcribe");
        setProgress(`Retrying chunk ${index + 1}/${chunks.length}…`);
        runOne(ch)
          .then(() => toast.success(`Chunk ${index + 1} recovered.`))
          .catch((err) => toast.error(err instanceof Error ? err.message : "Chunk retry failed"))
          .finally(() => { setBusy(null); setProgress(""); });
      };


      await new Promise<void>((resolve, reject) => {
        const pump = () => {
          if (firstError) { if (inFlight === 0) reject(firstError); return; }
          if (stoppedRef.current) {
            if (inFlight === 0) resolve();
            return;
          }
          while (inFlight < CONCURRENCY && nextToSchedule < chunks.length && !pausedRef.current && !stoppedRef.current) {
            const ch = chunks[nextToSchedule++];
            inFlight++;
            runOne(ch)
              .catch((err) => { if (!firstError) firstError = err; })
              .finally(() => { inFlight--; pump(); });
          }
          if (inFlight === 0 && nextToSchedule >= chunks.length) resolve();
          // If paused, wait then retry pump.
          if (pausedRef.current && inFlight === 0) {
            waitWhilePaused().then(pump);
          }
        };
        pump();
      });

      if (stoppedRef.current) toast.message(`Stopped at ${done}/${chunks.length} chunks. Partial SRT kept.`);

      setProgress("");
      const finalStatus: TranscriptStatus = stoppedRef.current ? "stopped" : "complete";
      // Final merge (already reflected in state, but capture the last snapshot).
      let merged = ""; let cueNum = 1;
      for (let i = 0; i < results.length; i++) {
        const s = results[i]; if (!s) continue;
        const shifted = shiftSrt(s, chunks[i].startSec, cueNum, chunks[i].endSec - chunks[i].startSec);
        merged = merged ? merged + "\n\n" + shifted.srt : shifted.srt;
        cueNum = shifted.nextCueNumber;
      }
      persistCurrent({
        status: finalStatus,
        srt: merged,
        chunks: { done, total: chunks.length },
        durationSec,
      });
      if (!stoppedRef.current) {
        toast.success(`Transcription complete · ${chunks.length} chunk(s) · ${fmtTime(durationSec)} total`);
      }

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transcription failed";
      if (isConnectionError(e)) { setInterrupted("transcribe"); toast.error("Connection lost — your file and settings are kept. Retry when you're back online."); persistCurrent({ status: "error", srt: latestSrtRef.current, error: msg }); return; }
      const outOfCredits = /out of credits|credits.*exhaust|payment required|402/i.test(msg);
      setOperationError(msg);
      toast.error(msg, outOfCredits ? { action: { label: "Change provider", onClick: () => openTranscriptionSettings() } } : undefined);
      persistCurrent({ status: "error", srt: latestSrtRef.current, error: msg });
    } finally {
      setBusy(null); setProgress("");
      pausedRef.current = false; setPaused(false); stoppedRef.current = false;
    }
  }

  function togglePause() {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) toast.message("Paused — current chunk will finish, then transcription pauses.");
    else toast.message("Resumed.");
  }

  function stopTranscribe() {
    stoppedRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    toast.message("Stopping after current chunk…");
  }


  async function runTranslate() {
    if (!srt || !targetLang) return toast.error("Pick a target language first.");
    if (busy) return;
    setOriginalSrt(srt); setOperationError(""); setInterrupted(null);
    setBusy("translate");
    try {
      const res = await translateFn({ data: {
        fileName: outName || "transcript.srt",
        sourceLang: sourceLang === "auto" ? "auto" : sourceLang,
        targetLang,
        content: srt,
        providerId: mtConfig.providerId,
        apiKey: mtConfig.apiKey || undefined,
        url: mtConfig.url || undefined,
        model: mtConfig.model || undefined,
        region: mtConfig.region || undefined,
        apiVersion: mtConfig.apiVersion || undefined,
        folderId: mtConfig.folderId || undefined,
      } });
      setSrt(res.translatedText);
      setOutName((outName || "transcript.srt").replace(/\.srt$/i, `.${targetLang}.srt`));
      toast.success("Translation complete.");
    } catch (e) { if (isConnectionError(e)) { setSrt(originalSrt || srt); setInterrupted("translate"); toast.error("Connection lost — translation can be retried."); return; } const message = e instanceof Error ? e.message : "Translation failed"; setOperationError(message); toast.error(message); }
    finally { setBusy(null); }
  }

  async function runPolish() {
    if (!srt || busy) return; setOriginalSrt(srt); setOperationError(""); setBusy("polish");
    try {
      const multiLang = sourceLang === "multi";
      const res = await polishFn({ data: {
        srt,
        // Mixed audio: never force one target language on the cleanup pass.
        targetLang: multiLang ? "multi" : (targetLang || (sourceLang !== "auto" ? sourceLang : "") || "en"),
        multiLang,
        providerId: mtConfig.providerId,
        apiKey: mtConfig.apiKey || undefined,
        url: mtConfig.url || undefined,
        model: mtConfig.model || undefined,
        apiVersion: mtConfig.apiVersion || undefined,
      } });
      setSrt(res.polishedSrt); toast.success("AI cleanup applied.");
    } catch (e) { const message = e instanceof Error ? e.message : "Polish failed"; setOperationError(message); toast.error(message); }
    finally { setBusy(null); }
  }

  function download(kind: "srt" | "vtt" | "txt") {
    if (!srt) return;
    const name = (outName || "transcript.srt").replace(/\.(srt|vtt|txt)$/i, "") + "." + kind;
    downloadText(subtitleExport(srt, kind), name);
  }

  function seekTo(sec: number) {
    if (mediaRef.current) { mediaRef.current.currentTime = sec; mediaRef.current.play().catch(() => {}); }
  }

  function reopenEntry(entry: TranscriptEntry) {
    if (busy) return;
    retryChunkRef.current = null; setDiag([]); setOriginalSrt(""); setOperationError("");
    setSrt(entry.srt || "");
    setOutName(entry.name || "transcript.srt");
    if (entry.sourceLang) setSourceLang(entry.sourceLang);
    if (entry.targetLang) setTargetLang(entry.targetLang);
    currentIdRef.current = entry.id;
    currentMetaRef.current = { createdAt: entry.createdAt };
    setShowHistory(false);
    toast.message(`Reopened ${entry.name}`, {
      description: entry.sourceFileName ? `From ${entry.sourceFileName}` : undefined,
    });
  }

  function removeEntry(id: string) {
    deleteEntry(id);
    refreshHistory();
    if (currentIdRef.current === id) currentIdRef.current = null;
  }


  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Transcribe — video & audio to subtitles</h1>
        <p className="text-sm text-muted-foreground">
          Video & audio · Timed subtitles · SRT / VTT / Text
        </p>
      </div>


      {/* Upload zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (busy) return; if (e.dataTransfer.files.length > 1) toast.info("One media file at a time — using the first file."); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
        onClick={() => { if (!busy) inputRef.current?.click(); }}
        role="button" tabIndex={busy ? -1 : 0} aria-disabled={!!busy} aria-label="Upload video or audio"
        onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); inputRef.current?.click(); } }}
        className="cursor-pointer rounded-lg border-2 border-dashed border-border bg-card/40 p-5 text-center transition hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-8"
      >
        <input ref={inputRef} type="file" className="hidden"
          accept="video/*,audio/*,.mp4,.webm,.mov,.m4v,.mkv,.avi,.mp3,.wav,.m4a,.ogg,.flac,.aac,.opus"
          disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }} />
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-gold" />
          <div className="text-sm text-foreground">
            {file ? <span className="font-medium break-all">{file.name} <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span> : "Drop a video or audio file, or click to choose (max 3 GB / ~3 hours)"}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap justify-center items-center gap-3">
            <span className="inline-flex items-center gap-1"><FileVideo className="h-3.5 w-3.5" /> MP4 · WebM · MOV · MKV</span>
            <span className="inline-flex items-center gap-1"><Mic className="h-3.5 w-3.5" /> MP3 · WAV · M4A · OGG · FLAC · AAC</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 rounded-xl border border-border bg-card/40 p-3 flex flex-wrap items-center gap-3">
        <TranscriptionSettings config={sttConfig} onChange={setSttConfig} />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Spoken language</span>
        <LanguagePicker value={sourceLang} onChange={setSourceLang} includeAuto />
        <Button variant="outline" onClick={runTranscribe} disabled={!file || !!busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy === "transcribe" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
          Transcribe
        </Button>
        {busy === "transcribe" && (
          <>
            <Button variant="outline" onClick={togglePause}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-card">
              {paused ? <><Play className="h-3.5 w-3.5" /> Resume</> : <><Pause className="h-3.5 w-3.5" /> Pause</>}
            </Button>
            <Button variant="outline" onClick={stopTranscribe}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowHistory((v) => !v)}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-card"
        >
          <History className="h-3.5 w-3.5" /> History
          {history.length > 0 && (
            <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] text-gold">{history.length}</span>
          )}
        </Button>
        {progress && <span className="w-full text-xs text-muted-foreground">{paused ? "Paused — " : ""}{progress}</span>}
      </div>

      {interrupted && !busy && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3"><p className="min-w-0 flex-1 text-sm text-destructive">{interrupted === "transcribe" ? "Transcription" : "Translation"} was interrupted by a lost connection. Your file and settings are kept.</p><div className="flex gap-2"><Button size="sm" onClick={() => { const k = interrupted; setInterrupted(null); if (k === "transcribe") void runTranscribe(); else void runTranslate(); }}><RotateCcw />Retry</Button><Button variant="ghost" size="sm" onClick={() => setInterrupted(null)}>Dismiss</Button></div></div>}
      {draft.savedAt && srt && !busy && <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">Edits saved on this device · {new Date(draft.savedAt).toLocaleTimeString()}</p>}
      {draft.saveError && <p role="alert" className="mt-2 text-sm text-destructive">Edits could not be saved on this device. Download your subtitles before leaving this page.</p>}
      {operationError && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3"><p className="min-w-0 flex-1 break-words text-sm text-destructive">{operationError}</p><Button variant="ghost" size="sm" onClick={() => setOperationError("")}>Dismiss</Button></div>}
      {diag.length > 0 && <div role="status" className="mt-4 space-y-2"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{diag.filter((ch) => ch.status === "done").length} / {diag.length} chunks · {cues.length} cues</span><span>{Math.round(diag.filter((ch) => ch.status === "done").length / diag.length * 100)}%</span></div><progress aria-label="Transcription progress" className="h-2 w-full accent-primary" max={diag.length} value={diag.filter((ch) => ch.status === "done").length} /></div>}

      {/* Per-chunk diagnostics */}
      <ChunkDiagnostics
        chunks={diag}
        busy={!!busy}
        onRetryChunk={(i) => retryChunkRef.current?.(i)}
      />

      {/* Transcription history panel */}
      {showHistory && (
        <div className="mt-4 rounded-xl border border-border bg-card/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              History ({filteredHistory.length}/{history.length})
            </div>
            {history.length > 0 && (
              <Button variant="outline"
                type="button"
                onClick={() => { if (window.confirm("Delete all saved transcripts on this device?")) { clearHistory(); refreshHistory(); } }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-card"
              >
                <Trash2 className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>
          {history.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Search by name, file, or transcript text…"
                  className="w-full rounded-md border border-border bg-background pl-7 pr-2 py-1 text-xs focus:border-gold/60 focus:outline-none"
                />
              </div>
              <select
                value={historyStatus}
                onChange={(e) => setHistoryStatus(e.target.value as "all" | TranscriptStatus)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-gold/60 focus:outline-none"
              >
                <option value="all">All statuses</option>
                <option value="complete">Complete</option>
                <option value="running">Running</option>
                <option value="paused">Paused</option>
                <option value="stopped">Stopped</option>
                <option value="error">Error</option>
              </select>
            </div>
          )}
          {history.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No transcripts yet. Run a transcription to start building history.</div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No entries match your search or filter.</div>
          ) : (
            <ul className="max-h-[320px] divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/50">
              {filteredHistory.map((h) => (
                <li key={h.id} className="flex items-center gap-3 p-2 text-xs">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    h.status === "complete" ? "bg-emerald-500/15 text-emerald-400"
                    : h.status === "running" ? "bg-blue-500/15 text-blue-400"
                    : h.status === "paused" ? "bg-amber-500/15 text-amber-400"
                    : h.status === "error" ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
                  }`}>{h.status}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">{h.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {fmtRelative(h.updatedAt)}
                      {h.sourceFileName ? ` · ${h.sourceFileName}` : ""}
                      {h.chunks ? ` · ${h.chunks.done}/${h.chunks.total} chunks` : ""}
                      {h.sourceLang ? ` · ${h.sourceLang}` : ""}
                      {h.targetLang ? ` → ${h.targetLang}` : ""}
                    </div>
                  </div>
                  <Button variant="outline"
                    type="button"
                    onClick={() => reopenEntry(h)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-card"
                  >
                    <RotateCcw className="h-3 w-3" /> Reopen
                  </Button>
                  <Button variant="outline"
                    type="button"
                    onClick={() => removeEntry(h.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-card"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}




      {/* Live preview + cue editor */}
      {(mediaUrl || srt) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          {/* Player */}
          <div className="rounded-xl border border-border bg-card/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Live preview</div>
              <SubtitleStylerButton style={subStyle} onChange={setSubStyle} />
            </div>
            {mediaUrl && isVideo && (
              <video
                ref={(el) => { mediaRef.current = el; }}
                src={mediaUrl}
                controls
                preload="metadata"
                onError={() => setOperationError("This browser cannot preview the selected video. Try WebM or a browser-compatible MP4.")}
                className="w-full rounded-lg bg-background"
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
              />
            )}
            {mediaUrl && !isVideo && (
              <audio
                ref={(el) => { mediaRef.current = el; }}
                src={mediaUrl}
                controls
                preload="metadata"
                onError={() => setOperationError("This browser cannot preview the selected audio. Try WAV or MP3.")}
                className="w-full"
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
              />
            )}
            {/* Subtitle overlay */}
            {activeCueIdx >= 0 && (
              <div
                key={activeCueIdx}
                className={`mt-2 rounded-lg px-3 py-2 text-center ${subStyle.enabled ? subtitleAnimClass(subStyle) : "bg-black/80 text-sm text-white"}`}
                style={subtitleCssVars(subStyle)}
              >
                {cues[activeCueIdx].text}
                {langCues[activeCueIdx]?.lang.code !== "und" && (
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-wider opacity-70">
                    {langCues[activeCueIdx].lang.name}
                  </div>
                )}
              </div>
            )}
            {/* Language-change timeline markers */}
            {langMarkers.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Detected language timeline · {langMarkers.length} change{langMarkers.length === 1 ? "" : "s"}
                </div>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border/50 p-2">
                  {langMarkers.map((m) => (
                    <Button variant="outline"
                      key={`${m.at}-${m.to}`}
                      type="button"
                      onClick={() => seekTo(m.at)}
                      title={`Jump to ${m.name} @ ${Math.floor(m.at / 60)}:${String(Math.floor(m.at % 60)).padStart(2, "0")}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:border-gold hover:text-foreground"
                    >
                      <span>{`${Math.floor(m.at / 60)}:${String(Math.floor(m.at % 60)).padStart(2, "0")}`}</span>
                      <span className="text-foreground">{m.name}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Inline cue editor — edit, then Save writes back to the SRT */}
          <EditableCueList
            disabled={!!busy}
            cues={langCues}
            activeCueIdx={activeCueIdx}
            seekTo={seekTo}
            onSave={(next) => {
              const rebuilt = cuesToSrt(next);
              setSrt(rebuilt);
              persistCurrent({ status: "complete", srt: rebuilt });
              toast.success("Transcript saved.");
            }}
          />
        </div>
      )}

      {/* Translate / Polish / Download */}
      {srt && (
        <>
          <div className="mt-4 rounded-xl border border-border bg-card/40 p-3 flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Translate to</span>
            <LanguagePicker value={targetLang} onChange={setTargetLang} placeholder="Select target…" />
            <ProviderSettings config={mtConfig} onChange={setMtConfig} />
            <Button variant="outline" onClick={runTranslate} disabled={!targetLang || !!busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-card disabled:opacity-50">
              {busy === "translate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
              Translate
            </Button>
            <Button variant="outline" onClick={runPolish} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-card disabled:opacity-50">
              {busy === "polish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              AI cleanup
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={() => download("srt")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
                <Download className="h-3.5 w-3.5" /> SRT
              </Button>
              <Button variant="outline" onClick={() => download("vtt")} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-card">
                <Download className="h-3.5 w-3.5" /> VTT
              </Button>
              <Button variant="outline" onClick={() => download("txt")} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-card">
                <Download className="h-3.5 w-3.5" /> TXT
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="transcript-name" className="text-xs text-muted-foreground">Filename</label>
            <input id="transcript-name" value={outName} onChange={(e) => setOutName(e.target.value)} className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" />
            {originalSrt && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => { setSrt(originalSrt); setOriginalSrt(""); }}><Undo2 /> Restore original</Button>}
          </div>
          <textarea aria-label="Transcript subtitle text" disabled={!!busy} value={srt} onChange={(e) => setSrt(e.target.value)} spellCheck={false}
            className="mt-3 w-full h-[320px] rounded-xl border border-border bg-card/40 p-3 font-mono text-xs text-foreground" />
        </>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Tip: large files are decoded and chunked in your browser to keep each upload under provider limits.
        If decoding fails, transcode to MP4/MP3 first. Browser memory cap is roughly ~2 GB on desktop Chrome.
      </p>
    </AppShell>
  );
}

type Cue = { start: number; end: number; text: string };

function EditableCueList({
  cues,
  activeCueIdx,
  seekTo,
  onSave,
  disabled = false,
}: {
  disabled?: boolean;
  cues: LangCue[];
  activeCueIdx: number;
  seekTo: (sec: number) => void;
  onSave: (next: Cue[]) => void;
}) {
  const [drafts, setDrafts] = useState<string[]>(() => cues.map((c) => c.text));
  const sigRef = useRef<string>("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Reset drafts when the underlying cue set changes (new transcript, translate, polish).
  useEffect(() => {
    const sig = JSON.stringify(cues.map((c) => [c.start, c.end, c.text]));
    if (sig !== sigRef.current) {
      sigRef.current = sig;
      setDrafts(cues.map((c) => c.text));
    }
  }, [cues]);

  const dirty = useMemo(
    () => drafts.some((t, i) => t !== (cues[i]?.text ?? "")),
    [drafts, cues],
  );

  const stats = useMemo(() => {
    const chars = drafts.reduce((n, t) => n + t.length, 0);
    const words = drafts.reduce((n, t) => n + (t.trim() ? t.trim().split(/\s+/).length : 0), 0);
    return { chars, words };
  }, [drafts]);

  const commit = useCallback(() => {
    onSave(cues.map((c, i) => ({ ...c, text: drafts[i] ?? c.text })));
  }, [cues, drafts, onSave]);

  // Auto-scroll to the currently-playing cue so the editor tracks playback.
  useEffect(() => {
    if (activeCueIdx < 0) return;
    const row = rowRefs.current[activeCueIdx];
    const container = listRef.current;
    if (!row || !container) return;
    const rt = row.offsetTop;
    const rb = rt + row.offsetHeight;
    if (rt < container.scrollTop || rb > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: rt - container.clientHeight / 3, behavior: "smooth" });
    }
  }, [activeCueIdx]);

  // Ctrl/Cmd+S to save while editing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (!dirty || disabled) return;
        e.preventDefault();
        commit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, commit, disabled]);

  function resetCue(i: number) {
    setDrafts((prev) => { const n = prev.slice(); n[i] = cues[i]?.text ?? ""; return n; });
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3 flex flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Transcript editor · {cues.length} cue{cues.length === 1 ? "" : "s"} · {stats.words} words · {stats.chars} chars
        </div>
        <Button variant="outline"
          type="button"
          onClick={commit}
          disabled={!dirty || disabled}
          title="Save edits (Ctrl/⌘+S)"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {dirty ? <><Save className="h-3 w-3" /> Save edits</> : <><Check className="h-3 w-3" /> Saved</>}
        </Button>
      </div>
      <div ref={listRef} className="h-[360px] overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/40">
        {cues.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">No cues yet — transcribe to populate.</div>
        )}
        {cues.map((c, i) => {
          const cueDirty = (drafts[i] ?? "") !== (c.text ?? "");
          return (
            <div
              key={`${i}-${c.start}`}
              ref={(el) => { rowRefs.current[i] = el; }}
              className={`flex gap-2 p-2 text-xs ${i === activeCueIdx ? "bg-gold/15" : ""}`}
            >
              <Button variant="outline"
                type="button"
                onClick={() => seekTo(c.start)}
                className="shrink-0 inline-flex items-start gap-1 font-mono text-muted-foreground hover:text-foreground"
                title="Play from here"
              >
                <Play className="h-3 w-3 mt-0.5" />
                {`${Math.floor(c.start / 60)}:${String(Math.floor(c.start % 60)).padStart(2, "0")}`}
              </Button>
              {c.lang?.code && c.lang.code !== "und" && (
                <span
                  title={`Detected ${c.lang.name} (${c.lang.script})`}
                  className="shrink-0 self-start rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {c.lang.code}
                </span>
              )}
              <textarea
                disabled={disabled}
                aria-label={`Caption ${i + 1}`}
                value={drafts[i] ?? ""}
                onChange={(e) => setDrafts((prev) => { const n = prev.slice(); n[i] = e.target.value; return n; })}
                rows={Math.min(4, Math.max(1, (drafts[i] ?? "").split("\n").length))}
                spellCheck
                className="min-w-0 flex-1 resize-y rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus:border-gold focus:outline-none"
              />
              {cueDirty && (
                <Button variant="outline"
                  type="button"
                  onClick={() => resetCue(i)}
                  title="Revert this cue"
                  className="shrink-0 self-start rounded-md border border-border bg-background p-1 text-muted-foreground hover:text-foreground"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
