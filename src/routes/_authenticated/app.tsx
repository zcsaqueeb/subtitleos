import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocalDraft, isConnectionError } from "@/lib/local-draft";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import JSZip from "jszip";
import { Upload, Loader2, Download, Wand2, FileText, X, ArrowRight, FileArchive, CheckCircle2, AlertCircle, Pause, Play, Square, Sparkles, Trash2, ArrowLeftRight, Copy, SlidersHorizontal, Subtitles , RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { downloadText, subtitleExport, translatedZip } from "@/lib/subtitle-workflow";
import { TranslationReview } from "@/components/translation-review";
import { parseTimedCaptions, srtTimestamp } from "@/lib/media-tools";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { translateSubtitles, polishSrt } from "@/lib/translate.functions";
import { translateCuesChunk, saveTranslation } from "@/lib/translate-stream.functions";
import { assertBatchAccess } from "@/lib/batch.functions";
import { explainTranslationError, type TranslationErrorInfo } from "@/lib/translation-error";
import { TranslationErrorBanner } from "@/components/translation-error-banner";
import {
  parse as parseSubtitle,
  cuesToSrt,
  srtToCues,
  isSupportedSubtitle,
  isUnsupportedSubtitle,
  getExt,
  type ParsedSubtitle,
} from "@/lib/subtitle-formats";
import { extractArchive, archiveKind } from "@/lib/archive-extract";

import { transcribeAudio } from "@/lib/transcribe.functions";
import { ProviderSettings, useProviderConfig } from "@/components/provider-settings";
import { LanguagePicker } from '@/components/language-picker';
import { useTranscriptionConfig } from "@/components/transcription-settings";
import { AnimeRunner } from "@/components/anime-runner";
import { flagFor, detectLanguage, LANGUAGES as ALL_LANGS } from "@/lib/translation/languages";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { StudioPanel, useStudioSettings, frameAlignSrt } from "@/components/studio-panel";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [
    { title: "Translate Subtitles — SubtitleOS" },
    { name: "description", content: "Translate subtitle files with live preview, language selection, and batch processing." },
    { property: "og:title", content: "Translate Subtitles — SubtitleOS" },
    { property: "og:description", content: "Translate subtitle files with live preview, language selection, and batch processing." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AppPage,
});

const LANGS = ALL_LANGS;

const SAMPLE = `1
00:00:01,000 --> 00:00:03,500
We're going to need a bigger boat.

2
00:00:04,000 --> 00:00:06,000
Hold on, this is going to get rough.

3
00:00:06,500 --> 00:00:09,000
Whatever happens, stay close to me.
`;

function AppPage() {
  return (
    <AppShell>
      <Translator />
    </AppShell>
  );
}

/** Split an SRT/VTT into cue blocks on the client (mirrors server logic). */
function splitSrtClient(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split("\n");
    let textStart = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/-->/.test(lines[i])) { textStart = i + 1; break; }
    }
    return {
      header: lines.slice(0, textStart).join("\n"),
      text: lines.slice(textStart).join("\n"),
    };
  });
}
function joinSrtClient(blocks: { header: string; text: string }[]) {
  return blocks.map((b) => (b.header ? `${b.header}\n${b.text}` : b.text)).join("\n\n");
}

// Persist live translation progress so a provider switch (or reload) resumes
// from the last completed cue instead of retranslating everything.
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
type LiveProgress = { translated: string[]; providers: (string | null)[] };
function loadLiveProgress(k: string): LiveProgress | null {
  if (typeof window === "undefined") return null;
  try { const v = window.localStorage.getItem(`sos.livetx.${k}`); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function saveLiveProgress(k: string, p: LiveProgress): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(`sos.livetx.${k}`, JSON.stringify(p)); } catch { /* quota */ }
}
function clearLiveProgress(k: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(`sos.livetx.${k}`); } catch { /* ignore */ }
}
const PROVIDER_LABELS: Record<string, string> = {
  lovable: "Built-in AI", edgeFreeAPI: "Edge (free)", deeplx: "DeepLX",
  gtxFreeAPI: "GTX (free)", google: "Google", deepl: "DeepL", azure: "Azure",
  mymemory: "MyMemory (free)", libretranslate: "LibreTranslate",
  openai: "OpenAI", gemini: "Gemini", aliceAI: "Alice AI",
};
const providerLabel = (id: string | null | undefined) => id ? (PROVIDER_LABELS[id] ?? id) : "";

function Translator() {
  const [reviewMode, setReviewMode] = useState("text");
  const [fileName, setFileName] = useState("untitled.srt");
  const [outputName, setOutputName] = useState("");
  const [exportKind, setExportKind] = useState<"srt" | "vtt" | "txt">("srt");
  const [content, setContent] = useState(SAMPLE);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("ur");
  const [detected, setDetected] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [liveCues, setLiveCues] = useState<string[]>([]);
  const [liveProviders, setLiveProviders] = useState<(string | null)[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [errorInfo, setErrorInfo] = useState<TranslationErrorInfo | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [provider, setProvider] = useProviderConfig();
  const [stt, setStt] = useTranscriptionConfig();
  const [studio, setStudio] = useStudioSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const liveScrollRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const resumeWaiters = useRef<Array<() => void>>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!running && !liveCues.length) return;
    const el = liveScrollRef.current;
    if (!el) return;
    // Follow the current batch: scroll proportionally to translated progress
    // so the latest filled cue stays in view instead of jumping to the bottom.
    const total = progress?.total ?? liveCues.length;
    const done = progress?.done ?? liveCues.filter(Boolean).length;
    const ratio = total > 0 ? Math.min(1, done / total) : 1;
    const target = Math.max(
      0,
      ratio * (el.scrollHeight - el.clientHeight) - el.clientHeight * 0.25,
    );
    requestAnimationFrame(() => {
      el.scrollTo({ top: target, behavior: "smooth" });
    });
  }, [liveCues, running, progress?.done, progress?.total]);

  const translateChunkFn = useServerFn(translateCuesChunk);
  const saveFn = useServerFn(saveTranslation);
  const transcribeFn = useServerFn(transcribeAudio);
  const polishFn = useServerFn(polishSrt);
  const [transcribing, setTranscribing] = useState(false);
  const [interrupted, setInterrupted] = useState<false | "translate" | "polish">(false);
  const draft = useLocalDraft("translator", { fileName, outputName, content, result, sourceLang, targetLang, exportKind }, (d) => {
    if (typeof d.content === "string") setContent(d.content);
    if (d.fileName) setFileName(d.fileName);
    if (typeof d.outputName === "string") setOutputName(d.outputName);
    if (typeof d.result === "string" && d.result) setResult(d.result);
    if (d.sourceLang) setSourceLang(d.sourceLang);
    if (d.targetLang) setTargetLang(d.targetLang);
    if (d.exportKind) setExportKind(d.exportKind);
    if (d.content !== SAMPLE || d.result) toast.success("Restored your saved subtitle edits");
  }, !running);

  function autoDetect(text: string) {
    const code = detectLanguage(text);
    setDetected(code);
    const label = LANGS.find((l) => l.code === code)?.name ?? code;
    toast.success(`Detected ${flagFor(code)} ${label}`);

  }

  async function handleFile(file: File) {
    const MAX = 3 * 1024 * 1024 * 1024; // 3 GB
    if (file.size > MAX) {
      toast.error("File too large (max 3 GB).");
      return;
    }
    const isVideo = /\.(mp4|mkv|mov|webm|avi|m4v|ts)$/i.test(file.name) || file.type.startsWith("video/");
    const isAudio = /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(file.name) || file.type.startsWith("audio/");

    if (isVideo) {
      toast.info("Open Transcribe for video subtitles; your current translation is unchanged.");
      return;
    }

    if (isAudio) {
      // Lovable AI gateway caps audio uploads at ~25 MiB.
      if (file.size > 24 * 1024 * 1024) {
        toast.error("Audio too large for transcription (max 24 MB). Split it into shorter clips.");
        return;
      }
      setTranscribing(true);
      try {
        // Get duration via decodeAudioData so we can build SRT timestamps.
        const buf = await file.arrayBuffer();
        let durationSec = 0;
        try {
          const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
          const ctx = new AC();
          const decoded = await ctx.decodeAudioData(buf.slice(0));
          durationSec = decoded.duration;
          await ctx.close();
        } catch {
          // Fallback: assume 1 second per 16KB (very rough); user can edit timings after.
          durationSec = Math.max(5, file.size / 16_000);
        }

        // Encode to base64 for the JSON server-fn payload.
        const bytes = new Uint8Array(buf);
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
        }
        const base64 = btoa(bin);

        toast.info(`Transcribing with ${stt.providerId}… this can take up to a minute.`);
        const { srt } = await transcribeFn({
          data: {
            fileName: file.name,
            mime: file.type || "audio/mpeg",
            base64,
            durationSec,
            language: sourceLang === "auto" ? undefined : sourceLang,
            providerId: stt.providerId,
            apiKey: stt.apiKey,
            url: stt.url,
            model: stt.model,
          },
        });
        const outName = file.name.replace(/\.[^.]+$/, "") + ".srt";
        setFileName(outName);
        setContent(srt);
        setResult(null);
        setLiveCues([]);
        autoDetect(srt);
        toast.success("Transcription complete — review timings, then translate.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Transcription failed");
      } finally {
        setTranscribing(false);
      }
      return;
    }

    if (file.size > 8_000_000) {
      toast.error("Subtitle text too large (max 8 MB).");
      return;
    }
    const raw = await file.text();
    const parsed = parseSubtitle(file.name, raw);
    const text = parsed && parsed.kind !== "srt" ? cuesToSrt(parsed.cues) : raw;
    setFileName(file.name);
    setContent(text);
    setResult(null);
    setLiveCues([]);
    autoDetect(text);
  }

  function handleDownload() {
    if (!result) return;
    const base = outputName.trim().replace(/\.[^.]+$/, "") || fileName.replace(/\.[^.]+$/, "") || "translation";
    downloadText(subtitleExport(result, exportKind), `${base}.${targetLang}.${exportKind}`);
  }

  function togglePause() {
    if (!running) return;
    if (pauseRef.current) {
      // resume
      pauseRef.current = false;
      setPaused(false);
      const waiters = resumeWaiters.current;
      resumeWaiters.current = [];
      waiters.forEach((fn) => fn());
    } else {
      pauseRef.current = true;
      setPaused(true);
      toast("Paused — click Resume to continue.");
    }
  }
  function stopRun() {
    if (!running) return;
    stopRef.current = true;
    // wake any pause waiters so the loop can exit
    if (pauseRef.current) {
      pauseRef.current = false;
      setPaused(false);
      resumeWaiters.current.forEach((fn) => fn());
      resumeWaiters.current = [];
    }
  }
  function waitIfPaused(): Promise<void> {
    if (!pauseRef.current) return Promise.resolve();
    return new Promise((resolve) => resumeWaiters.current.push(resolve));
  }

  async function runPolish() {
    if (!result || polishing) return;
    setPolishing(true);
    setErrorInfo(null);
    try {
      const { polishedSrt, cueCount } = await polishFn({
        data: {
          srt: result,
          targetLang,
          // Use the same provider/key the user picked for translation.
          providerId: provider.providerId,
          apiKey: provider.apiKey || undefined,
          url: provider.url || undefined,
          model: provider.model || undefined,
          apiVersion: provider.apiVersion || undefined,
        },
      });
      setResult(polishedSrt);
      toast.success(`Polished ${cueCount} cues — meaning, numbering, and timestamps preserved.`);
    } catch (e) {
      if (isConnectionError(e)) { setInterrupted("polish"); toast.error("Connection lost — your subtitle edits are kept. Retry polishing when online."); return; }
      const info = explainTranslationError(e);
      setErrorInfo(info);
      toast.error(info.title);
    } finally {
      setPolishing(false);
    }
  }

  async function run() {
    const effectiveSource = sourceLang === "auto" ? detectLanguage(content) : sourceLang;
    if (effectiveSource === targetLang) return toast.error("Source and target must differ.");
    if (!content.trim()) return toast.error("Paste or upload subtitle text first.");
    setResult(null);
    setErrorInfo(null);
    setInterrupted(false);
    setRunning(true);
    setPaused(false);
    stopRef.current = false;
    pauseRef.current = false;
    const started = Date.now();

    try {
      const blocks = splitSrtClient(content);
      const cues = blocks.map((b) => b.text);
      const BATCH = 5;

      // Resume state: reuse any cue already translated for this exact (content, srcLang, tgtLang).
      const progressKey = hashKey(`${effectiveSource}|${targetLang}|${content}`);
      const saved = loadLiveProgress(progressKey);
      const translated: string[] = new Array(cues.length).fill("");
      const cueProviders: (string | null)[] = new Array(cues.length).fill(null);
      let resumedCount = 0;
      if (saved && saved.translated?.length === cues.length) {
        for (let i = 0; i < cues.length; i++) {
          const t = saved.translated[i];
          if (t && t.length > 0) {
            translated[i] = t;
            cueProviders[i] = saved.providers?.[i] ?? null;
            resumedCount++;
          }
        }
      }
      setLiveCues([...translated]);
      setLiveProviders([...cueProviders]);
      setProgress({ done: resumedCount, total: cues.length });
      if (resumedCount > 0) {
        toast.info(`Resuming — ${resumedCount}/${cues.length} cues already translated.`);
      }

      // Provider fallback chain for live translation: if the primary provider
      // gets rate limited or errors mid-stream, switch to a free fallback and
      // continue with the remaining cues instead of failing the whole job.
      const isHinglish = targetLang === "hi-Latn";
      const MT_IDS = new Set(["edgeFreeAPI", "deeplx", "gtxFreeAPI", "google", "azure", "deepl", "mymemory", "libretranslate"]);
      const primaryId = (provider as { providerId?: string }).providerId || "gtxFreeAPI";
      const FREE_FALLBACKS = isHinglish
        ? ["lovable"]
        : ["edgeFreeAPI", "deeplx", "gtxFreeAPI", "mymemory", "lovable"];
      const chain: Array<{ cfg: typeof provider; label: string }> = [
        { cfg: provider, label: primaryId },
        ...FREE_FALLBACKS.filter((id) => id !== primaryId && !(isHinglish && MT_IDS.has(id)))
          .map((id) => ({ cfg: { providerId: id } as typeof provider, label: id })),
      ];
      let chainIdx = 0;

      async function translateSlice(slice: string[]): Promise<{ translations: string[]; providerId: string }> {
        let lastErr: unknown;
        while (chainIdx < chain.length) {
          const step = chain[chainIdx];
          try {
            const res = await translateChunkFn({
              data: {
                sourceLang: effectiveSource,
                targetLang,
                cues: slice,
                ...step.cfg,
                glossaryId: studio.glossaryId ?? undefined,
                priority: studio.priority || undefined,
              },
            });
            return { translations: res.translations, providerId: step.label };
          } catch (e) {
            lastErr = e;
            if (isConnectionError(e)) throw e;
            const msg = e instanceof Error ? e.message : String(e);
            if (/402|forbidden|unauthor|language_locked|limit_reached/i.test(msg)) throw e;
            const isRateOrTransient = /429|rate.?limit|too many|quota|timeout|network|fetch|502|503|504|ENOTFOUND|ECONN/i.test(msg);
            if (chainIdx < chain.length - 1) {
              chainIdx++;
              toast.info(`${providerLabel(step.label)} ${isRateOrTransient ? "rate-limited" : "failed"} — switching to ${providerLabel(chain[chainIdx].label)} for remaining cues.`);
              continue;
            }
            throw e;
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error("Translation failed");
      }

      for (let i = 0; i < cues.length; i += BATCH) {
        await waitIfPaused();
        if (stopRef.current) break;
        // Skip already-translated cues from a previous run (resume).
        const sliceIdx: number[] = [];
        for (let j = i; j < Math.min(i + BATCH, cues.length); j++) {
          if (!translated[j]) sliceIdx.push(j);
        }
        if (sliceIdx.length === 0) {
          setProgress({ done: Math.min(i + BATCH, cues.length), total: cues.length });
          continue;
        }
        const slice = sliceIdx.map((k) => cues[k]);
        const res = await translateSlice(slice);
        for (let j = 0; j < sliceIdx.length; j++) {
          translated[sliceIdx[j]] = res.translations[j] ?? slice[j];
          cueProviders[sliceIdx[j]] = res.providerId;
        }
        setLiveCues([...translated]);
        setLiveProviders([...cueProviders]);
        const doneCount = translated.filter(Boolean).length;
        setProgress({ done: doneCount, total: cues.length });
        saveLiveProgress(progressKey, { translated, providers: cueProviders });
      }

      const completed = translated.every((t) => t.length > 0);
      let output = joinSrtClient(blocks.map((b, i) => ({ header: b.header, text: translated[i] || b.text })));
      if (studio.frameAccurate && studio.fps > 0) output = frameAlignSrt(output, studio.fps);
      setResult(output);

      if (completed && !stopRef.current) {
        clearLiveProgress(progressKey);
        try {
          await saveFn({
            data: {
              fileName,
              sourceLang: effectiveSource,
              targetLang,
              sourceText: content,
              translatedText: output,
              durationMs: Date.now() - started,
            },
          });
          queryClient.invalidateQueries({ queryKey: ["history"] });
          queryClient.invalidateQueries({ queryKey: ["monthly-usage"] });
        } catch { /* save failure shouldn't hide the result */ }
        toast.success("Translation complete");
      } else if (stopRef.current) {
        toast("Stopped — progress saved. Click Translate to resume.");
      }
    } catch (e) {
      if (isConnectionError(e)) { setInterrupted("translate"); toast.error("Connection lost — your subtitles and completed cues are kept."); return; }
      const info = explainTranslationError(e);
      setErrorInfo(info);
      toast.error(info.title);
    } finally {
      setRunning(false);
      setPaused(false);
      stopRef.current = false;
      pauseRef.current = false;
      setProgress(null);
    }
  }


  // Build a live SRT-like preview from the cues translated so far, annotating
  // each cue with the provider that produced it so continuity is verifiable.
  const livePreview = (() => {
    if (result) return result;
    if (!liveCues.length) return null;
    const blocks = splitSrtClient(content);
    return joinSrtClient(
      blocks.map((b, i) => {
        const t = liveCues[i] ? liveCues[i] : "…";
        const p = liveProviders[i];
        const tag = p ? `  ⟨${providerLabel(p)}⟩` : "";
        return { header: b.header, text: `${t}${tag}` };
      }),
    );
  })();

  // Aggregate per-provider counts and contiguous time ranges for the summary bar.
  const providerSummary = (() => {
    if (!liveProviders.some(Boolean)) return null;
    const blocks = splitSrtClient(content);
    const counts = new Map<string, number>();
    const ranges: { provider: string; from: string; to: string }[] = [];
    let curProv: string | null = null;
    let curStart = "";
    let curEnd = "";
    const timeFromHeader = (h: string) => {
      const m = h.match(/(\d\d:\d\d:\d\d[,.]\d\d\d)\s*-->\s*(\d\d:\d\d:\d\d[,.]\d\d\d)/);
      return m ? { s: m[1], e: m[2] } : null;
    };
    for (let i = 0; i < blocks.length; i++) {
      const p = liveProviders[i];
      if (!p) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
      const t = timeFromHeader(blocks[i]?.header ?? "");
      if (!t) continue;
      if (p !== curProv) {
        if (curProv) ranges.push({ provider: curProv, from: curStart, to: curEnd });
        curProv = p; curStart = t.s; curEnd = t.e;
      } else { curEnd = t.e; }
    }
    if (curProv) ranges.push({ provider: curProv, from: curStart, to: curEnd });
    return { counts: [...counts.entries()], ranges };
  })();


  const sourceCaptions = useMemo(() => parseTimedCaptions(content), [content]);
  const busy = running || transcribing || polishing;
  const percentage = progress ? Math.round(progress.done / Math.max(1, progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary"><LanguagesIcon /></div>
          <div><h1 className="font-display text-3xl">Translator</h1><p className="mt-1 text-xs text-muted-foreground">Subtitles / Translation studio</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/batch"><FileArchive /> Batch ZIP</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link to="/transcribe"><Upload /> Video / audio</Link></Button>
        </div>
      </header>

      <div className="space-y-4 border-b border-border pb-5">
        <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="min-w-0 space-y-2 sm:min-w-40 sm:flex-1"><p className="text-xs font-medium text-muted-foreground">Source language</p><LanguagePicker value={sourceLang} onChange={setSourceLang} includeAuto includeMixed label="Source language" className="w-full" /></div>
          <Button variant="ghost" size="icon" aria-label="Swap languages" title="Swap languages" disabled={busy || (sourceLang === 'auto' && !detected) || sourceLang === 'multi'} onClick={() => { const nextSource = sourceLang === 'auto' ? detected : sourceLang; if (!nextSource) return; setSourceLang(targetLang); setTargetLang(nextSource); }}><ArrowLeftRight /></Button>
          <div className="min-w-0 space-y-2 sm:min-w-40 sm:flex-1"><p className="text-xs font-medium text-muted-foreground">Target language</p><LanguagePicker value={targetLang} onChange={setTargetLang} label="Target language" className="w-full" /></div>
          <div className="min-w-0 space-y-2 sm:min-w-48"><p className="text-xs font-medium text-muted-foreground">Translation engine</p><ProviderSettings config={provider} onChange={setProvider} /></div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{detected && sourceLang === 'auto' ? `Detected: ${LANGS.find(l => l.code === detected)?.name ?? detected}` : `${sourceCaptions.length} timed cues`} · {content.length.toLocaleString()} characters</p>
          <div className="flex flex-wrap gap-2">
            {running && <><Button variant="outline" onClick={togglePause}>{paused ? <Play /> : <Pause />}{paused ? 'Resume' : 'Pause'}</Button><Button variant="outline" onClick={stopRun}><Square />Stop</Button></>}
            <Button onClick={run} disabled={busy || !content.trim()} className="min-w-36">{running ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Wand2 />}{running ? (paused ? 'Paused' : 'Translating…') : 'Translate'}</Button>
          </div>
        </div>
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="options" className="border-border">
          <AccordionTrigger className="py-2 text-xs hover:no-underline"><span className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-muted-foreground" />Translation options{studio.frameAccurate ? ` · ${studio.fps} fps` : ''}{studio.glossaryId ? ' · Glossary' : ''}</span></AccordionTrigger>
          <AccordionContent className="pt-3"><fieldset disabled={busy}><StudioPanel settings={studio} onChange={setStudio} /></fieldset></AccordionContent>
        </AccordionItem>
      </Accordion>

      {interrupted && !busy && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3"><p className="min-w-0 flex-1 text-sm text-destructive">{interrupted === "polish" ? "Polishing" : "Translation"} was interrupted by a lost connection. Your subtitles and settings are kept.</p><div className="flex gap-2"><Button size="sm" onClick={() => { const task = interrupted; setInterrupted(false); if (task === "polish") void runPolish(); else void run(); }}><RotateCcw />Retry</Button><Button variant="ghost" size="sm" onClick={() => setInterrupted(false)}>Dismiss</Button></div></div>}
      {draft.saveError && <p role="alert" className="text-sm text-destructive">Edits could not be saved on this device. Download your subtitles before leaving this page.</p>}
      {draft.savedAt && !running && <p className="text-xs text-muted-foreground" aria-live="polite">Edits saved on this device · {new Date(draft.savedAt).toLocaleTimeString()}</p>}
      {errorInfo && <TranslationErrorBanner info={errorInfo} onDismiss={() => setErrorInfo(null)} />}
      {progress && <div role="status" className="space-y-2 border-b border-border pb-4">
        <div className="flex justify-between text-xs"><span>{paused ? 'Paused' : 'Translating'} · {progress.done} / {progress.total} cues</span><span className="font-mono text-primary">{percentage}%</span></div>
        <progress aria-label="Translation progress" value={progress.done} max={Math.max(1, progress.total)} className="h-2 w-full accent-primary" />
        {providerSummary && <p className="text-xs text-muted-foreground">{providerSummary.counts.map(([id, n]) => `${providerLabel(id)} · ${n} cues`).join(' / ')}</p>}
      </div>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <section className="min-w-0 space-y-3" aria-label="Source subtitles">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="truncate" title={fileName}>{fileName}</span></div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" aria-label="Clear source" title="Clear source" disabled={busy || !content} onClick={() => { setContent(''); setResult(null); setLiveCues([]); setLiveProviders([]); setDetected(null); }}><Trash2 /></Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><Upload />Upload</Button>
              <input ref={fileRef} type="file" aria-label="Upload subtitle file" accept=".srt,.vtt,.txt,.sbv,.ass,.ssa,.sub,.ttml,.dfxp,.xml,.smi,.sami,.mp3,.wav,.m4a,.ogg,.flac,.aac,audio/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void handleFile(file); e.target.value = ''; }} />
            </div>
          </div>
          <div className="relative" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file && !busy) void handleFile(file); }}>
            <textarea aria-label="Source subtitle text" placeholder="Paste subtitle text…" value={content} onChange={e => { setContent(e.target.value); setResult(null); setLiveCues([]); setLiveProviders([]); setDetected(null); }} spellCheck={false} disabled={busy} className="h-[330px] w-full resize-y rounded-md border border-input bg-background p-4 font-mono text-sm leading-7 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 sm:h-[390px]" />
            {transcribing && <div role="status" className="absolute inset-0 flex items-center justify-center bg-background/90"><AnimeRunner label="Transcribing audio…" size="sm" /></div>}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground"><span>{sourceCaptions.length} cues</span><span>{sourceCaptions.length ? srtTimestamp(sourceCaptions[sourceCaptions.length - 1].end) : 'Untimed text'}</span></div>
        </section>

        <section className="min-w-0 space-y-3" aria-label="Translated subtitles">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Subtitles className="size-4 text-primary" />Translation<span className="text-xs text-muted-foreground">{targetLang.toUpperCase()}</span></div>
            <Tabs value={reviewMode} onValueChange={setReviewMode}><TabsList><TabsTrigger value="text">Text</TabsTrigger><TabsTrigger value="review" disabled={!result || running}>Cue review</TabsTrigger></TabsList></Tabs>
          </div>
          <div ref={liveScrollRef} className="h-[330px] overflow-auto rounded-md border border-input bg-muted/20 p-4 sm:h-[390px]">
            {result && !running ? reviewMode === 'review' ? <TranslationReview source={content} output={result} language={targetLang} /> : <textarea aria-label="Edit translation" value={result} disabled={polishing} onChange={e => setResult(e.target.value)} spellCheck={false} className="h-full w-full resize-none bg-transparent font-mono text-sm leading-7 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" dir={['ur', 'ar', 'he', 'fa'].includes(targetLang) ? 'rtl' : 'ltr'} /> : livePreview ? <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-7" dir={['ur', 'ar', 'he', 'fa'].includes(targetLang) ? 'rtl' : 'ltr'}>{livePreview}</pre> : <div role="status" className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><Subtitles className="size-10 text-primary/50" /><p className="text-sm">{running ? 'Translating first cues…' : 'No translation yet'}</p></div>}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground"><span>{result ? 'Translation available' : running ? 'In progress' : 'Awaiting translation'}</span><span>{result ? `${result.length.toLocaleString()} characters` : LANGS.find(l => l.code === targetLang)?.name}</span></div>
        </section>
      </div>

      {result && !running && <section aria-label="Translation export" className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-medium">Export translation</h2><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Copy translation" title="Copy translation" onClick={async () => { try { await navigator.clipboard.writeText(result); toast.success('Translation copied'); } catch { toast.error('Copy unavailable. Download the translation instead.'); } }}><Copy /></Button><Button variant="outline" disabled={polishing} onClick={runPolish}>{polishing ? <Loader2 className="animate-spin" /> : <Sparkles />}{polishing ? 'Polishing…' : 'Polish'}</Button></div></div>
        <div className="flex flex-col gap-3 sm:flex-row"><input aria-label="Output filename" value={outputName} onChange={e => setOutputName(e.target.value)} placeholder={fileName.replace(/\.[^.]+$/, '')} className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" /><select aria-label="Translation download format" value={exportKind} onChange={e => setExportKind(e.target.value as typeof exportKind)} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="srt">SRT</option><option value="vtt">VTT</option><option value="txt">Text</option></select><Button onClick={handleDownload} className="h-11"><Download />Download</Button></div>
      </section>}
    </div>
  );
}

function LanguagesIcon() { return <Wand2 className="size-5" />; }


function LangSelect({
  label,
  value,
  onChange,
  allowAuto = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowAuto?: boolean;
}) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <LanguagePicker value={value} onChange={onChange} includeAuto={allowAuto} includeMixed={allowAuto} label={label === 'From' ? 'Source language' : 'Target language'} className="max-w-[240px]" />
    </div>
  );
}


type BatchItem = {
  name: string;
  content: string;
  ext: string;
  parsed: ParsedSubtitle | null;
  detectedLang?: string;
  status: "pending" | "translating" | "done" | "error";
  translated?: string;
  error?: string;
};

export function BatchZipTranslator() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("es");
  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useProviderConfig();
  const [batchQuotaUsed, setBatchQuotaUsed] = useState(0);
  const zipRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const translateFn = useServerFn(translateSubtitles);
  const assertBatch = useServerFn(assertBatchAccess);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const cancelRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [fallbackProviderId, setFallbackProviderId] = useState<string>("auto");
  const [batchError, setBatchError] = useState<TranslationErrorInfo | null>(null);
  const [studio] = useStudioSettings();
  const [stylePreset, setStylePreset] = useState<"default"|"netflix"|"anime"|"disney"|"literal"|"natural"|"dub">("default");
  const folderRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const [importSummary, setImportSummary] = useState("");
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  useEffect(() => () => { if (zipUrl) URL.revokeObjectURL(zipUrl); }, [zipUrl]);
  function invalidateZip() { setZipUrl(null); }







  /**
   * Accept any combination of subtitle files, archives, and dropped folders
   * (via webkitdirectory). Skips unsupported entries and merges all detected
   * subtitle files into a single batch (capped at 50).
   */
  async function handleFiles(files: File[]) {
    if (!files.length || running || importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setImportSummary("Reading files…");
    invalidateZip();
    const merged: BatchItem[] = [...items];
    const initialCount = merged.length;
    let omitted = 0;
    try {
    let skipped = 0;
    let unsupportedBinary = 0;
    for (const file of files) {
      if (merged.length >= 50) { omitted++; continue; }
      if (file.size > 20 * 1024 * 1024) { skipped++; continue; }
      const kind = archiveKind(file.name);
      if (kind) {
        try {
          const entries = await extractArchive(file);
          for (const entry of entries) {
            if (merged.length >= 50) { omitted++; continue; }
            if (entry.name.endsWith("/")) continue;
            if (isUnsupportedSubtitle(entry.name)) { unsupportedBinary++; continue; }
            if (!isSupportedSubtitle(entry.name)) { skipped++; continue; }
            if (entry.content.length > 200_000) { skipped++; continue; }
            const parsed = parseSubtitle(entry.name, entry.content);
            if (!parsed || parsed.cues.length === 0) { skipped++; continue; }
            merged.push({
              name: entry.name, content: entry.content, ext: getExt(entry.name),
              parsed, detectedLang: detectLanguage(parsed.cues.join("\n")), status: "pending",
            });
          }
        } catch (error) { skipped++; toast.error(error instanceof Error ? error.message : "Archive could not be read"); }
        continue;
      }
      if (isUnsupportedSubtitle(file.name)) { unsupportedBinary++; continue; }
      if (!isSupportedSubtitle(file.name)) { skipped++; continue; }
      try {
        const content = await file.text();
        if (content.length > 200_000) { skipped++; continue; }
        const parsed = parseSubtitle(file.name, content);
        if (!parsed || parsed.cues.length === 0) { skipped++; continue; }
        merged.push({
          name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          content, ext: getExt(file.name), parsed,
          detectedLang: detectLanguage(parsed.cues.join("\n")), status: "pending",
        });
      } catch { skipped++; }
    }
    if (!merged.length) { setImportSummary("No supported subtitle files found."); return toast.error("No supported subtitle files found."); }
    setItems(merged);
    const parts = [`Added ${merged.length - initialCount} files · ${merged.length} in queue`];
    if (skipped) parts.push(`${skipped} unsupported skipped`);
    if (unsupportedBinary) parts.push(`${unsupportedBinary} binary skipped`);
    if (omitted) parts.push(`${omitted} omitted · queue capacity 50 files`);
    setImportSummary(parts.join(" · "));
    toast.success(parts.join(" · "));
    } finally { importingRef.current = false; setImporting(false); }
  }

  async function runBatch(opts: { resume?: boolean; retryFailed?: boolean } = {}) {
    if (sourceLang === targetLang) return toast.error("Source and target must differ.");
    if (!items.length) return toast.error("Upload a ZIP first.");
    // Server gate: paid-only, even if UI is bypassed.
    try {
      await assertBatch();
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Batch translation could not start.");
    }
    if (opts.retryFailed && !items.some((i) => i.status === "error")) {
      return toast.info("No failed files to retry.");
    }
    cancelRef.current = false;
    setPaused(false);
    setBatchError(null);
    setRunning(true);
    if (!opts.resume && !opts.retryFailed) {
      setBatchQuotaUsed(0);
      setZipUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    }
    // On resume/retry: keep already-done items; reset only the targets.
    const next: BatchItem[] = items.map((it) => {
      if (opts.retryFailed) {
        return it.status === "error"
          ? { ...it, status: "pending", error: undefined }
          : it;
      }
      return opts.resume && it.status === "done"
        ? it
        : { ...it, status: "pending", translated: opts.resume ? it.translated : undefined, error: undefined };
    });
    setItems([...next]);
    // Build provider fallback chain. If user picked a manual fallback provider,
    // use that as primary; otherwise use the configured provider with auto-cascade.
    // Hinglish (hi-Latn) requires an LLM provider — MT providers can't output Roman-script Hindi.
    const isHinglish = targetLang === "hi-Latn";
    const MT_IDS = new Set(["edgeFreeAPI", "deeplx", "gtxFreeAPI", "google", "azure", "deepl", "mymemory", "libretranslate"]);
    const FREE_FALLBACKS = isHinglish
      ? ["lovable"]
      : ["lovable", "edgeFreeAPI", "deeplx", "gtxFreeAPI", "mymemory"];
    let manual = fallbackProviderId !== "auto" ? fallbackProviderId : null;
    if (isHinglish && manual && MT_IDS.has(manual)) {
      toast.info("Hinglish needs an LLM — using the built-in AI engine.");
      manual = "lovable";
    }
    let primaryCfg = manual ? ({ providerId: manual } as unknown as typeof provider) : provider;
    let primaryId = manual || (provider as { providerId?: string }).providerId || "gtxFreeAPI";
    if (isHinglish && MT_IDS.has(primaryId)) {
      // Configured default is MT but Hinglish needs an LLM; use the built-in engine.
      primaryCfg = { providerId: "lovable" } as unknown as typeof provider;
      primaryId = "lovable";
    }
    const fallbackChain = [
      { cfg: primaryCfg, label: primaryId, retry: true },
      ...FREE_FALLBACKS.filter((id) => id !== primaryId).map((id) => ({
        cfg: { providerId: id } as typeof provider,
        label: id,
        retry: false,
      })),
    ];

    async function attempt(idx: number) {
      const item = next[idx];
      // Build an SRT payload from the parsed cues so the translator (which
      // expects SRT) sees a uniform input regardless of original format.
      const cues = item.parsed ? item.parsed.cues : [item.content];
      const srtPayload = item.parsed ? cuesToSrt(cues) : item.content;
      const effectiveSource = sourceLang === "auto"
        ? (item.detectedLang || detectLanguage(cues.join("\n")) || "en")
        : sourceLang;
      if (effectiveSource === targetLang) {
        throw new Error(`Source and target are both "${targetLang}". Detected ${effectiveSource} — pick a different target.`);
      }
      let lastErr: unknown;
      for (const step of fallbackChain) {
        const tries = step.retry ? 2 : 1;
        for (let t = 0; t < tries; t++) {
          if (cancelRef.current) throw new Error("__canceled__");
          try {
            return await translateFn({
              data: {
                fileName: item.name,
                sourceLang: effectiveSource,
                targetLang,
                content: srtPayload,
                batch: true,
                glossaryId: studio.glossaryId ?? undefined,
                priority: studio.priority || undefined,
                stylePreset: stylePreset !== "default" ? stylePreset : undefined,
                ...step.cfg,
              },
            });
          } catch (e) {
            lastErr = e;
            const msg = e instanceof Error ? e.message : String(e);
            // Don't fall back on entitlement/auth/validation errors.
            if (/402|forbidden|unauthor|language_locked|limit_reached/i.test(msg)) throw e;
            if (t === tries - 1 && step !== fallbackChain[fallbackChain.length - 1]) {
              toast.info(`${item.name}: ${step.label} failed, trying fallback…`);
            }
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("Failed");
    }


    for (let i = 0; i < next.length; i++) {
      if (cancelRef.current) break;
      if (next[i].status === "done") continue;
      setCurrentIdx(i);
      next[i] = { ...next[i], status: "translating" };
      setItems([...next]);
      try {
        const res = await attempt(i);
        if (cancelRef.current) {
          next[i] = { ...next[i], status: "pending", error: undefined };
          setItems([...next]);
          break;
        }
        // Map translated SRT cues back into the original format to preserve
        // styling, timestamps, numbering and metadata.
        let finalText = res.translatedText;
        const parsed = next[i].parsed;
        if (parsed) {
          const translatedCues = srtToCues(res.translatedText, parsed.cues.length);
          finalText = parsed.rebuild(translatedCues);
        }
        next[i] = { ...next[i], status: "done", translated: finalText };
        setBatchQuotaUsed((n) => n + 1);
        queryClient.invalidateQueries({ queryKey: ["monthly-usage"] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed";
        if (cancelRef.current || msg === "__canceled__") {
          next[i] = { ...next[i], status: "pending", error: undefined };
          setItems([...next]);
          break;
        }
        next[i] = { ...next[i], status: "error", error: msg };
        setBatchError((prev) => prev ?? explainTranslationError(e));
      }
      setItems([...next]);
    }
    setCurrentIdx(-1);
    setRunning(false);
    const wasCanceled = cancelRef.current;
    cancelRef.current = false;
    queryClient.invalidateQueries({ queryKey: ["history"] });
    const ok = next.filter((i) => i.status === "done").length;
    const failed = next.filter((i) => i.status === "error").length;
    const remaining = next.filter((i) => i.status === "pending").length;
    // Auto-build the final ZIP so users get a one-click download link.
    try {
      const done = next.filter((i) => i.status === "done" && i.translated);
      if (done.length) {
        setZipProgress(0);
        const blob = await translatedZip(done, targetLang, setZipProgress);
        setZipProgress(null);
        setZipUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob); });
        // Persist a recent batch entry so users can revisit & re-download.
        try {
          const { saveBatchJob } = await import("@/lib/batch-history");
          await saveBatchJob({
            sourceLang,
            targetLang,
            fileCount: next.length,
            okCount: ok,
            failedCount: failed,
            zipSize: blob.size,
            fileNames: done.map((d) => d.name).slice(0, 50),
          }, blob);
          window.dispatchEvent(new CustomEvent("batch-history-changed"));
        } catch { /* ignore persistence errors */ }
      }
    } catch (error) { setZipProgress(null); toast.error(error instanceof Error ? error.message : "ZIP creation failed. Download individual files or try again."); }
    if (wasCanceled) {
      setPaused(remaining > 0);
      toast.info(`Batch paused: ${ok} done · ${remaining} remaining. Click Resume to continue.`);
    } else if (failed === 0) {
      setPaused(false);
      toast.success(`Batch complete: ${ok}/${next.length} translated.`);
    } else {
      setPaused(false);
      toast.warning(`Batch finished: ${ok} ok · ${failed} failed.`);
    }
  }

  function cancelBatch() {
    if (!running) return;
    cancelRef.current = true;
  }

  async function downloadZip() {
    if (zipProgress !== null) return;
    // Server re-check to prevent free users from downloading even via console.
    try {
      await assertBatch();
    } catch (e) {

      return toast.error(e instanceof Error ? e.message : "Batch download could not start.");
    }
    if (zipUrl) {
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = `translations_${targetLang}.zip`;
      a.click();
      return;
    }
    const done = items.filter((i) => i.status === "done" && i.translated);
    if (!done.length) return toast.error("Nothing to download yet.");
    setZipProgress(0);
    let blob: Blob;
    try { blob = await translatedZip(done, targetLang, setZipProgress); }
    catch (error) { toast.error(error instanceof Error ? error.message : "ZIP creation failed"); return; }
    finally { setZipProgress(null); }
    const url = URL.createObjectURL(blob);
    setZipUrl(url);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translations_${targetLang}.zip`;
    a.click();
  }


  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="mt-10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">
            Batch translate (ZIP)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an archive (.zip, .tar, .tar.gz) or a single subtitle file. Supports .srt, .vtt, .ass/.ssa, .sbv, .sub, .ttml/.dfxp/.xml, .smi/.sami. Source language auto-detects per file.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProviderSettings config={provider} onChange={setProvider} />
          <LangSelect label="From" value={sourceLang} onChange={(value) => { if (!running) { setSourceLang(value); setItems((prev) => prev.map((it) => ({ ...it, status: "pending", translated: undefined }))); invalidateZip(); } }} allowAuto />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <LangSelect label="To" value={targetLang} onChange={(value) => { if (!running) { setTargetLang(value); setItems((prev) => prev.map((it) => ({ ...it, status: "pending", translated: undefined }))); invalidateZip(); } }} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/40 p-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleFiles(Array.from(e.dataTransfer.files)); }}>
        {importSummary && <p role="status" className="mb-3 text-sm text-muted-foreground">{importSummary}</p>}
        {zipProgress !== null && <p role="status" className="mb-3 text-sm text-gold">Preparing ZIP · {zipProgress}%</p>}
        <fieldset disabled={running || importing || zipProgress !== null} className="mb-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!items.length || importing || zipProgress !== null} onClick={() => { setItems([]); invalidateZip(); setImportSummary(""); setPaused(false); }}><Trash2 /> Clear queue</Button>
          <span className="self-center text-xs text-muted-foreground">{items.length} / 50 files</span>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline"
              disabled={running || importing || zipProgress !== null}
              onClick={() => zipRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent"
            >
              <FileArchive className="h-4 w-4 text-gold" /> Upload files / ZIPs
            </Button>
            <Button variant="outline"
              disabled={running || importing || zipProgress !== null}
              onClick={() => folderRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent"
              title="Drop a folder of subtitle files"
            >
              <FileArchive className="h-4 w-4 text-gold" /> Upload folder
            </Button>
            <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
              Style
              <select
                value={stylePreset}
                onChange={(e) => setStylePreset(e.target.value as typeof stylePreset)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="default">Default</option>
                <option value="netflix">Netflix</option>
                <option value="anime">Anime</option>
                <option value="disney">Disney</option>
                <option value="literal">Literal</option>
                <option value="natural">Natural</option>
                <option value="dub">Dub</option>
              </select>
            </label>
          </div>
          <input
            ref={zipRef}
            type="file"
            multiple
            accept=".zip,.tar,.tar.gz,.tgz,.rar,.7z,.srt,.vtt,.ass,.ssa,.sbv,.sub,.ttml,.dfxp,.xml,.smi,.sami"
            className="hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) handleFiles(list);
              e.target.value = "";
            }}
          />
          <input
            ref={folderRef}
            type="file"
            // @ts-expect-error non-standard but widely supported folder input
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) handleFiles(list);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <Button variant="outline"
                onClick={() => cancelBatch()}
                className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
              >
                <Square className="h-4 w-4" /> Cancel
              </Button>
            ) : paused ? (
              <>
                <Button variant="outline"
                  onClick={() => runBatch({ resume: true })}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  style={{ boxShadow: "var(--shadow-gold)" }}
                >
                  <Wand2 className="h-4 w-4" /> Resume batch
                </Button>
                <Button variant="outline"
                  onClick={() => { setPaused(false); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  Dismiss
                </Button>
              </>
            ) : (
              <Button variant="outline"
                disabled={!items.length || importing || zipProgress !== null}
                onClick={() => runBatch()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                style={{ boxShadow: "var(--shadow-gold)" }}
              >
                <Wand2 className="h-4 w-4" /> Translate batch
              </Button>
            )}
            {running && (
              <span className="text-xs text-muted-foreground">
                Translating {Math.min(currentIdx + 1, items.length)}/{items.length}…
              </span>
            )}
            <select
              value={fallbackProviderId}
              onChange={(e) => setFallbackProviderId(e.target.value)}
              disabled={running}
              title={targetLang === "hi-Latn" ? "Hinglish needs an LLM — MT providers are disabled." : "Manual provider for batch (overrides default and fallback chain primary)"}
              className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
            >
              <option value="auto">Auto (smart switch)</option>
              <option value="edgeFreeAPI" disabled={targetLang === "hi-Latn"}>Edge (Free){targetLang === "hi-Latn" ? " — no Hinglish" : ""}</option>
              <option value="deeplx" disabled={targetLang === "hi-Latn"}>DeepLX{targetLang === "hi-Latn" ? " — no Hinglish" : ""}</option>
              <option value="gtxFreeAPI" disabled={targetLang === "hi-Latn"}>GTX (Free){targetLang === "hi-Latn" ? " — no Hinglish" : ""}</option>
              <option value="mymemory" disabled={targetLang === "hi-Latn"}>MyMemory (Free){targetLang === "hi-Latn" ? " — no Hinglish" : ""}</option>
            </select>
            {!running && items.some((i) => i.status === "error") && (
              <Button variant="outline"
                onClick={() => runBatch({ retryFailed: true })}
                className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold hover:bg-gold/20"
              >
                <Wand2 className="h-4 w-4" /> Retry failed only
              </Button>
            )}
            <Button variant="outline"
              disabled={!doneCount || running || zipProgress !== null}
              onClick={downloadZip}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Download ZIP
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Translation memory: on
            </span>
            {studio.glossaryId ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
                Glossary attached
              </span>
            ) : (
              <span>No glossary — pick one in the Studio panel to apply it to batch jobs.</span>
            )}
            {studio.priority && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
                Priority engine
              </span>
            )}
          </div>

        </div>


        {batchError && (
          <div className="mt-3">
            <TranslationErrorBanner info={batchError} onDismiss={() => setBatchError(null)} />
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
                <span>
                  <span className="font-medium text-foreground">{doneCount}</span> done ·{" "}
                  <span className="text-destructive">{items.filter((i) => i.status === "error").length}</span> failed ·{" "}
                  <span>{items.filter((i) => i.status === "pending").length}</span> queued
                </span>
              </span>
              <span>{Math.round((doneCount / Math.max(items.length, 1)) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${Math.round((doneCount / Math.max(items.length, 1)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {zipUrl && !running && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Your ZIP is ready.
            </span>
            <a
              href={zipUrl}
              download={`translations_${targetLang}.zip`}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10"
            >
              <Download className="h-3.5 w-3.5" /> Download ZIP
            </a>
          </div>
        )}

        {running && currentIdx >= 0 && items[currentIdx] && (
          <div className="mt-3 rounded-xl border border-gold/30 bg-gold/5 p-3">
            <div className="flex items-center gap-2 text-xs text-gold">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-medium">Live translating</span>
              <span className="font-mono text-muted-foreground truncate">{items[currentIdx].name}</span>
            </div>
            {(() => {
              const lastDone = [...items].reverse().find((x) => x.status === "done" && x.translated);
              const preview = lastDone?.translated?.split("\n").filter((l) => l && !/^\d+$/.test(l) && !l.includes("-->")).slice(0, 3).join(" · ");
              return preview ? (
                <div className="mt-2 max-h-16 overflow-hidden text-xs text-muted-foreground">
                  <span className="text-foreground/70">Latest:</span> {preview.slice(0, 220)}{preview.length > 220 ? "…" : ""}
                </div>
              ) : null;
            })()}
          </div>
        )}

        {items.length > 0 && (
          <ScrollArea className="mt-4 h-72 rounded-xl border border-border bg-background/40">
            <ul className="divide-y divide-border">
              {items.map((it, idx) => {
                const pendingBefore = items.slice(0, idx).filter((x) => x.status === "pending" || x.status === "translating").length;
                const queuePos = it.status === "pending" ? pendingBefore + (running ? 0 : 1) : 0;
                return (
                  <li key={idx} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-6 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{idx + 1}</span>
                    <div className="min-w-0 flex-1"><span className="block truncate font-mono text-xs" title={it.name}>{it.name}</span><span className="text-[10px] text-muted-foreground">{it.parsed?.cues.filter(Boolean).length ?? 0} cues · {it.detectedLang || "auto"} · {it.ext.toUpperCase()}</span></div>
                    {it.status === "done" && it.translated && <Button variant="ghost" size="icon-sm" aria-label={`Download ${it.name}`} title="Download subtitle" onClick={() => { if (it.translated) downloadText(it.translated, `${it.name.replace(/\.[^.]+$/, "")}.${targetLang}.${it.ext}`); }}><Download /></Button>}
                    {!running && !importing && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${it.name}`} title="Remove file" onClick={() => { setItems((prev) => prev.filter((_, index) => index !== idx)); invalidateZip(); }}><X /></Button>}
                    {it.status === "pending" && (
                      <span className="text-xs text-muted-foreground">
                        {running ? `queued · #${queuePos}` : "queued"}
                      </span>
                    )}
                    {it.status === "translating" && (
                      <span className="inline-flex items-center gap-1 text-xs text-gold">
                        <Loader2 className="h-3 w-3 animate-spin" /> translating{currentIdx === idx ? " · now" : ""}
                      </span>
                    )}
                    {it.status === "done" && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> done
                      </span>
                    )}
                    {it.status === "error" && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive" title={it.error}>
                        <AlertCircle className="h-3 w-3" /> {it.error ? (it.error.length > 40 ? it.error.slice(0, 40) + "…" : it.error) : "failed"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}

      </div>
    </div>

  );
}
