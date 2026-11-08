import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Upload, FileVideo, Mic, Download, Sparkles, FileText, Copy, RotateCcw, X, AlertCircle, Pencil, Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { summarizeMedia } from "@/lib/summarize.functions";
import { LanguagePicker } from "@/components/language-picker";
import { ProviderSettings, useProviderConfig } from "@/components/provider-settings";
import { TranscriptionSettings, useTranscriptionConfig, validateTranscriptionConfig, openTranscriptionSettings } from "@/components/transcription-settings";
import { summaryBaseName, summaryPlainText, summaryTranscript } from "@/lib/summary-workflow";
import { z } from "zod";

const Search = z.object({ mode: z.enum(["video", "audio"]).catch("video") });
export const Route = createFileRoute("/_authenticated/summarize")({
  validateSearch: (s) => Search.parse(s),
  head: () => ({ meta: [
    { title: "AI Video & Audio Summaries — SubtitleOS" },
    { name: "description", content: "Review video and audio transcripts, create multilingual summaries and key takeaways, and export your notes." },
    { property: "og:title", content: "AI Video & Audio Summaries — SubtitleOS" },
    { property: "og:description", content: "Create and review summaries from videos, audio recordings, or existing transcripts." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SummarizePage,
});

type SummaryStyle = "brief" | "detailed" | "bullets" | "chapters";
function SummarizePage() {
  const { mode } = Route.useSearch();
  const isVideo = mode === "video";
  const [source, setSource] = useState("media");
  const [file, setFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState<null | "transcribe" | "summarize">(null);
  const [progress, setProgress] = useState("");
  const [chunkProgress, setChunkProgress] = useState({ done: 0, total: 0 });
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [originalSummary, setOriginalSummary] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [style, setStyle] = useState<SummaryStyle>("bullets");
  const [language, setLanguage] = useState("en");
  const [speakerLabels, setSpeakerLabels] = useState(false);
  const [provider, setProvider] = useProviderConfig();
  const [sttConfig, setSttConfig] = useTranscriptionConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const runTranscribe = useServerFn(transcribeAudio);
  const runSummarize = useServerFn(summarizeMedia);

  useEffect(() => {
    if (!file) { setMediaUrl(""); return; }
    const url = URL.createObjectURL(file);
    setMediaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    generation.current++;
    running.current = false;
    setBusy(null); setProgress(""); setFile(null); setDuration(0);
    setTranscript(""); setSummary(""); setOriginalSummary(""); setError("");
  }, [mode]);

  function pickFile(next: File | null) {
    if (!next || running.current) return;
    const valid = isVideo ? /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(next.name) || next.type.startsWith("video/")
      : /\.(mp3|wav|m4a|ogg|flac|aac|webm|opus)$/i.test(next.name) || next.type.startsWith("audio/");
    if (!valid || !next.size) { setError(`Choose a non-empty ${mode} file.`); return; }
    setFile(next); setTranscript(""); setSummary(""); setOriginalSummary(""); setDuration(0); setError("");
  }

  async function importTranscript(next: File | null) {
    if (!next || running.current) return;
    try {
      const text = summaryTranscript(await next.text());
      if (!text) throw new Error("This transcript is empty.");
      setTranscript(text); setSummary(""); setOriginalSummary(""); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read this transcript."); }
  }

  async function handleRun() {
    if (running.current) return;
    const needsTranscription = source === "media" && !transcript.trim();
    if (needsTranscription) {
      if (!file) { setError("Choose a file first."); return; }
      const configError = validateTranscriptionConfig(sttConfig);
      if (configError) { setError(configError); return; }
    } else if (transcript.trim().length < 10) {
      setError("Add at least 10 characters of transcript text."); return;
    }
    running.current = true;
    const id = ++generation.current;
    const active = () => generation.current === id;
    setError(""); setChunkProgress({ done: 0, total: 0 });
    try {
      let text = transcript.trim();
      if (needsTranscription && file) {
        setBusy("transcribe"); setProgress("Preparing audio…");
        const { chunkMediaFile } = await import("@/lib/audio-chunk");
        const { chunks, durationSec } = await chunkMediaFile(file, { onProgress: (message) => { if (active()) setProgress(message); } });
        if (!active()) return;
        if (!chunks.length) throw new Error("No decodable audio was found in this file.");
        setDuration(durationSec);
        setChunkProgress({ done: 0, total: chunks.length });
        const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        text = "";
        for (const [index, chunk] of chunks.entries()) {
          if (!active()) return;
          setProgress(`Transcribing part ${index + 1} of ${chunks.length}…`);
          const base64 = await blobToBase64(chunk.blob);
          if (!active()) return;
          const result = await runTranscribe({ data: {
            fileName: file.name, mime: chunk.blob.type || "audio/wav", base64,
            durationSec: chunk.endSec - chunk.startSec, fileId, chunkIndex: index,
            providerId: sttConfig.providerId, apiKey: sttConfig.apiKey || undefined,
            url: sttConfig.url || undefined, model: sttConfig.model || undefined,
          } });
          if (!active()) return;
          const chunkText = result.text?.trim() ?? "";
          if (!chunkText) throw new Error(`No speech returned for part ${index + 1}. The completed transcript is preserved below.`);
          text += (text ? "\n\n" : "") + chunkText;
          setTranscript(text);
          setChunkProgress({ done: index + 1, total: chunks.length });
        }
      }
      if (!active()) return;
      if (text.length < 10) throw new Error("Not enough speech to summarize. Review the transcript before retrying.");
      if (text.length > 400_000) throw new Error("This transcript is too long for one summary. Split it into smaller sections.");
      setBusy("summarize"); setProgress("Generating summary…");
      const result = await runSummarize({ data: { transcript: text, mode, style, language, speakerLabels, provider } });
      if (!active()) return;
      if (!result.markdown.trim()) throw new Error("The provider returned an empty summary.");
      setSummary(result.markdown); setOriginalSummary(result.markdown); setEditing(false);
      toast.success("Summary ready.");
    } catch (e) {
      if (active()) setError(e instanceof Error ? e.message : "Could not complete the summary.");
    } finally {
      if (active()) { setBusy(null); setProgress(""); running.current = false; }
    }
  }

  const baseName = summaryBaseName(file?.name ?? `${mode}-notes`);
  function download(text: string, suffix: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${baseName}.${suffix}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copySummary() {
    try { await navigator.clipboard.writeText(summaryPlainText(summary)); toast.success("Summary copied."); }
    catch { setError("Could not copy. Download the summary instead."); }
  }
  function printSummary() {
    const popup = window.open("", "_blank");
    if (!popup) { setError("Allow pop-ups to print or save this summary as PDF."); return; }
    popup.opener = null;
    popup.document.title = `${baseName} — Summary`;
    const heading = popup.document.createElement("h1"); heading.textContent = `${baseName} — Summary`;
    const body = popup.document.createElement("pre"); body.textContent = summaryPlainText(summary);
    body.style.whiteSpace = "pre-wrap"; body.style.fontFamily = "sans-serif";
    popup.document.body.append(heading, body); popup.document.close(); popup.focus(); popup.print();
  }
  const Icon = isVideo ? FileVideo : Mic;
  const words = transcript.trim() ? transcript.trim().split(/\s+/u).length : 0;

  return <AppShell>
    <div className="mx-auto max-w-5xl space-y-7 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <h1 className="flex items-center gap-3 text-2xl font-semibold"><Icon className="size-6 shrink-0 text-primary" />AI {isVideo ? "Video" : "Audio"} Summary</h1>
        <div className="flex gap-2" aria-label="Summary mode">
          <Button asChild variant={isVideo ? "secondary" : "outline"} aria-current={isVideo ? "page" : undefined} disabled={!!busy}><Link to="/summarize" search={{ mode: "video" }} onClick={(e) => { if (busy) e.preventDefault(); }}><FileVideo />Video</Link></Button>
          <Button asChild variant={!isVideo ? "secondary" : "outline"} aria-current={!isVideo ? "page" : undefined} disabled={!!busy}><Link to="/summarize" search={{ mode: "audio" }} onClick={(e) => { if (busy) e.preventDefault(); }}><Mic />Audio</Link></Button>
        </div>
      </header>
      <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <section className="min-w-0 space-y-4">
          <h2 className="text-lg font-medium">Source</h2>
          <Tabs value={source} onValueChange={setSource}>
            <TabsList><TabsTrigger value="media" disabled={!!busy}>Media file</TabsTrigger><TabsTrigger value="transcript" disabled={!!busy}>Transcript</TabsTrigger></TabsList>
            <TabsContent value="media" className="space-y-4 pt-2">
              <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0] ?? null); }} className="space-y-3 rounded-lg border border-dashed border-border p-6 text-center">
                <Upload className="mx-auto size-7 text-muted-foreground" />
                <p className="break-words text-sm font-medium">{file?.name ?? `Choose a ${mode} file`}</p>
                {file && <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB{duration > 0 ? ` · ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : ""}</p>}
                <Button variant="outline" disabled={!!busy} onClick={() => inputRef.current?.click()}><Upload />{file ? "Replace file" : "Browse files"}</Button>
                <input ref={inputRef} type="file" aria-label={`Upload ${mode}`} accept={isVideo ? "video/*,.mp4,.webm,.mov,.m4v,.mkv,.avi" : "audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.opus,.webm"} className="hidden" onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </div>
              {mediaUrl && (isVideo ? <video key={mediaUrl} src={mediaUrl} controls playsInline preload="metadata" aria-label="Video preview" className="aspect-video w-full rounded-lg bg-ink object-contain" onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onError={() => setError("Video preview unavailable for this format. Transcription also depends on browser audio support.")} /> : <audio key={mediaUrl} src={mediaUrl} controls preload="metadata" aria-label="Audio preview" className="w-full" onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onError={() => setError("Your browser cannot play this audio format. Try WAV or MP3.")} />)}
            </TabsContent>
            <TabsContent value="transcript" className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="source-transcript" className="text-sm font-medium">Transcript text</label><Button variant="outline" onClick={() => importRef.current?.click()} disabled={!!busy}><Upload />Import TXT / SRT / VTT</Button></div>
              <input ref={importRef} type="file" accept=".txt,.srt,.vtt" aria-label="Import transcript" className="hidden" onChange={(e) => { void importTranscript(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              <Textarea id="source-transcript" value={transcript} onChange={(e) => setTranscript(e.target.value)} disabled={!!busy} rows={12} placeholder="Paste transcript…" className="resize-y" dir="auto" />
              <p className="text-xs text-muted-foreground">{words.toLocaleString()} words · {transcript.length.toLocaleString()} characters</p>
            </TabsContent>
          </Tabs>
        </section>
        <section className="min-w-0 space-y-4 lg:border-l lg:border-border lg:pl-7">
          <h2 className="text-lg font-medium">Summary settings</h2>
          <fieldset disabled={!!busy} className="min-w-0 space-y-4">
            <label className="block space-y-2 text-sm"><span>Summary style</span><select aria-label="Summary style" value={style} onChange={(e) => setStyle(e.target.value as SummaryStyle)} className="w-full rounded-md border border-input bg-background px-3 py-2"><option value="bullets">Bullet points</option><option value="brief">Brief · 3–5 sentences</option><option value="detailed">Detailed</option><option value="chapters">Chapters / outline</option></select></label>
            <div className="space-y-2 text-sm"><span>Output language</span><LanguagePicker value={language} onChange={setLanguage} className="w-full" /></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={speakerLabels} onChange={(e) => setSpeakerLabels(e.target.checked)} className="mt-1 size-4 accent-primary" /><span>Speaker attribution</span></label>
            <div className="flex flex-wrap gap-2"><ProviderSettings config={provider} onChange={setProvider} />{source === "media" && <TranscriptionSettings config={sttConfig} onChange={setSttConfig} />}</div>
          </fieldset>
          <Button onClick={handleRun} disabled={!!busy || (source === "media" ? !file && !transcript.trim() : !transcript.trim())} className="w-full"><Sparkles />{busy ? "Processing…" : summary ? "Regenerate summary" : "Generate summary"}</Button>
          {busy && <div role="status" aria-live="polite" className="space-y-2 text-sm"><p>{progress}</p>{busy === "transcribe" && chunkProgress.total > 0 && <><Progress value={100 * chunkProgress.done / chunkProgress.total} /><p className="text-xs text-muted-foreground">{chunkProgress.done} / {chunkProgress.total} parts completed</p></>}</div>}
        </section>
      </div>
      {error && <section role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"><AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" /><div className="min-w-0 flex-1 space-y-2"><p className="break-words text-sm">{error}</p>{error.includes("Transcription settings") && <Button variant="outline" onClick={openTranscriptionSettings}>Transcription settings</Button>}</div><Button variant="outline" size="icon" aria-label="Dismiss error" onClick={() => setError("")}><X /></Button></section>}
      {summary && <section className="space-y-5 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><FileText className="size-5 text-primary" />Summary</h2><div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" title="Copy summary" aria-label="Copy summary" onClick={copySummary}><Copy /></Button><Button variant="outline" size="icon" title={editing ? "Read summary" : "Edit summary"} aria-label={editing ? "Read summary" : "Edit summary"} onClick={() => setEditing(!editing)}>{editing ? <FileText /> : <Pencil />}</Button><Button variant="outline" onClick={() => download(summary, "summary.md")}><Download />MD</Button><Button variant="outline" onClick={() => download(summaryPlainText(summary), "summary.txt")}><Download />TXT</Button><Button variant="outline" onClick={printSummary}><Printer />PDF / Print</Button></div></div>
        {editing ? <div className="space-y-3"><Textarea aria-label="Edit summary text" value={summary} onChange={(e) => setSummary(e.target.value)} rows={16} dir="auto" /><Button variant="outline" disabled={summary === originalSummary} onClick={() => setSummary(originalSummary)}><RotateCcw />Restore original</Button></div> : <div dir="auto" className="max-w-none break-words text-sm leading-7 [&_h1]:mb-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:ps-5 [&_a]:text-primary [&_a]:underline [&_pre]:overflow-auto [&_blockquote]:border-s-2 [&_blockquote]:border-primary [&_blockquote]:ps-4"><ReactMarkdown skipHtml>{summary}</ReactMarkdown></div>}
      </section>}
      {source === "media" && transcript && <details className="space-y-4 border-t border-border pt-5"><summary className="cursor-pointer text-sm font-medium">Review transcript · {words.toLocaleString()} words</summary><Textarea aria-label="Review transcript" value={transcript} onChange={(e) => setTranscript(e.target.value)} disabled={!!busy} rows={10} dir="auto" /><Button variant="outline" onClick={() => download(transcript, "transcript.txt")}><Download />Transcript TXT</Button></details>}
      {source === "transcript" && transcript && <Button variant="outline" onClick={() => download(transcript, "transcript.txt")}><Download />Transcript TXT</Button>}
    </div>
  </AppShell>;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
