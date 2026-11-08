import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, ArrowRight, FileText, Users2, Sparkles, FileVideo, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { normalizeDubScript } from "@/lib/dubbing-workflow";
import { parseTimedCaptions } from "@/lib/media-tools";
import { BackButton } from "@/components/back-button";
import { LanguagePicker } from "@/components/language-picker";
import { createDubProject, listDubProjects, labelSpeakersInSrt } from "@/lib/dub-projects.functions";
import { createLipSyncUpload } from "@/lib/dub.functions";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { chunkMediaFile, shiftSrt } from "@/lib/audio-chunk";
import { TranscriptionSettings, useTranscriptionConfig, validateTranscriptionConfig, openTranscriptionSettings } from "@/components/transcription-settings";

export const Route = createFileRoute("/_authenticated/dub/projects")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Multi-Character Voice Dubbing \u2014 SubtitleOS" },
      { property: "og:description", content: "Studio-grade voice dubbing: detect every character, assign unique voices, dub with emotion. Movies, anime, YouTube, audiobooks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "Multi-Character Voice Dubbing — SubtitleOS" },
      { name: "description", content: "Studio-grade voice dubbing: detect every character, assign unique voices, dub with emotion. Movies, anime, YouTube, audiobooks." },
    ],
  }),
  component: DubProjectsPage,
});

function DubProjectsPage() {
  const list = useServerFn(listDubProjects);
  const { data, refetch, isLoading, error: listError } = useQuery({ queryKey: ["dub-projects"], queryFn: () => list() });
  const create = useServerFn(createDubProject);
  const signUpload = useServerFn(createLipSyncUpload);
  const transcribe = useServerFn(transcribeAudio);
  const [sttConfig, setSttConfig] = useTranscriptionConfig();
  const labelSrt = useServerFn(labelSpeakersInSrt);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [script, setScript] = useState("");
  const [sourceLang, setSourceLang] = useState<string | undefined>(undefined);
  const [targetLang, setTargetLang] = useState<string | undefined>("en");
  const [busy, setBusy] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoStep, setVideoStep] = useState<string>("");
  const [operationError, setOperationError] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const processing = useRef(false);
  const cues = useMemo(() => parseTimedCaptions(script), [script]);
  const visibleProjects = (data?.projects ?? []).filter((project: { name: string }) => project.name.toLowerCase().includes(projectSearch.toLowerCase()));

  async function onCreate() {
    if (processing.current) return;
    if (!name.trim() || !script.trim()) { toast.error("Add a project name and paste a script or SRT, or upload a video."); return; }
    processing.current = true; setOperationError(""); setBusy(true);
    try {
      const res = await create({ data: {
        name: name.trim(), script: normalizeDubScript(script), sourceLang, targetLang,
        sourceVideoPath: videoPath ?? undefined,
        sourceVideoName: videoFileName ?? undefined,
      } });
      toast.success("Project created — detecting characters…");
      navigate({ to: "/dub/projects/$id", params: { id: res.projectId } });
    } catch (e: any) {
      const message = e?.message ?? "Failed to create project";
      setOperationError(/unauthorized|authorization header/i.test(message)
        ? "Project saving is unavailable without an existing account session. Your script is still here; Movie Dubbing remains available for local recordings."
        : message);
    } finally { setBusy(false); processing.current = false; }
  }

  async function onScriptFile(f: File | null) {
    if (!f || processing.current) return;
    try {
    const text = normalizeDubScript(await f.text());
    if (!text) throw new Error("This script file is empty.");
    setScript(text); setOperationError("");
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    } catch (error) { setOperationError(error instanceof Error ? error.message : "Could not read the script."); }
  }

  async function onVideoFile(f: File | null) {
    if (!f || processing.current) return;
    const cfgErr = validateTranscriptionConfig(sttConfig);
    if (cfgErr) {
      toast.error(cfgErr, { action: { label: "Open settings", onClick: () => openTranscriptionSettings() } });
      return;
    }
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    processing.current = true; setOperationError(""); setVideoPath(null); setVideoFileName(null);
    setVideoBusy(true);
    setVideoStep("Uploading video…");
    try {
      const { video } = await signUpload({ data: { videoName: f.name } });
      const up = await fetch(video.signedUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type || "video/mp4" } });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      setVideoPath(video.path);
      setVideoFileName(f.name);

      // Chunk client-side and run transcription against the existing pipeline.
      setVideoStep("Preparing audio…");
      const { chunks } = await chunkMediaFile(f, { chunkSeconds: 300 });
      const fileId = `dub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let combined = ""; let cueOffset = 1;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        setVideoStep(`Transcribing chunk ${i + 1}/${chunks.length}…`);
        const base64 = await blobToBase64(c.blob);
        const r = await transcribe({ data: {
          fileName: `${fileId}-${i}.webm`, mime: c.blob.type || "audio/webm",
          base64, durationSec: c.endSec - c.startSec,
          fileId, chunkIndex: i,
          providerId: sttConfig.providerId,
          apiKey: sttConfig.apiKey || undefined,
          url: sttConfig.url || undefined,
          model: sttConfig.model || undefined,
        } });
        if (r?.srt) {
          const shifted = shiftSrt(r.srt, c.startSec, cueOffset, c.endSec - c.startSec);
          combined += (combined ? "\n\n" : "") + shifted.srt;
          setScript(combined);
          cueOffset = shifted.nextCueNumber;
        }
      }
      if (!combined.trim()) throw new Error("Transcription returned no text.");

      setVideoStep("Detecting speakers…");
      const { script: labeled } = await labelSrt({ data: { srt: combined } });
      setScript(labeled);
      toast.success("Video transcribed & speakers detected.");
    } catch (e: any) {
      setOperationError(e?.message ?? "Video processing failed");
    } finally {
      processing.current = false; setVideoBusy(false); setVideoStep("");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <BackButton />
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5"><h1 className="flex items-center gap-2 text-2xl font-semibold"><Users2 className="size-6 text-primary" />Multi-Character Studio</h1><Button asChild variant="outline"><Link to="/dub">Voice Dubbing</Link></Button></header>
        {operationError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm break-words">{operationError}<Button variant="outline" className="ml-2" onClick={() => setOperationError("")}>Dismiss</Button></div>}
        <section className="border-t border-border py-5 space-y-4">
          <h2 className="font-display text-lg flex items-center gap-2"><Plus className="h-4 w-4" /> New project</h2>

          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium"><FileVideo className="h-4 w-4 text-primary" /> Video (recommended)</div>
              <TranscriptionSettings config={sttConfig} onChange={setSttConfig} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload a video up to ~3 GB / 3 hours. We'll transcribe, detect speakers, and set the project up for a final lip-synced render.
            </p>
            <input
              type="file"
              accept="video/*,audio/*"
              disabled={videoBusy || busy}
              onChange={(e) => onVideoFile(e.target.files?.[0] ?? null)}
              className="mt-3 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground disabled:opacity-50"
            />
            {videoBusy && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {videoStep}
              </div>
            )}
            {videoPath && !videoBusy && (
              <div className="mt-2 text-xs text-primary">✓ Video ready for lip-sync: {videoFileName}</div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Project name</span>
              <input disabled={busy || videoBusy} value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Episode 12 — English dub"
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm focus:border-gold/60 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Or upload SRT / VTT / script</span>
              <input type="file" accept=".srt,.vtt,.txt,text/plain"
                disabled={busy || videoBusy} aria-label="Import character script" onChange={(e) => onScriptFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Source language (optional — auto-detected)</span>
              <LanguagePicker value={sourceLang ?? ""} onChange={(v) => setSourceLang(v || undefined)} placeholder="Auto-detect" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Target language</span>
              <LanguagePicker value={targetLang ?? "en"} onChange={setTargetLang} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Script (auto-filled from video, or paste directly)</span>
            <textarea aria-label="Project script" dir="auto" disabled={busy || videoBusy} value={script} onChange={(e) => setScript(e.target.value)} rows={8}
              placeholder={"1\n00:00:01,000 --> 00:00:03,500\nNARRATOR: Once upon a time…\n\n2\n00:00:04,000 --> 00:00:06,000\nALICE: Where are we?"}
              className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 font-mono text-xs focus:border-gold/60 focus:outline-none" />
          </label>
          <p className="text-xs text-muted-foreground">{cues.length ? `${cues.length} timed dialogue cues` : `${script.trim() ? script.trim().split(/\n+/).length : 0} script lines`}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onCreate} disabled={busy || videoBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              style={{ boxShadow: "var(--shadow-gold)" }}>
              {busy ? "Creating…" : "Create project & detect characters"} <ArrowRight className="h-4 w-4" />
            </Button>
            
          </div>
        </section>

        <section className="border-t border-border py-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg flex items-center gap-2"><FileText className="h-4 w-4" /> Your projects</h2>
            <Button variant="outline" onClick={() => refetch()} className="text-xs text-muted-foreground hover:text-foreground">Refresh</Button>
          </div>
          <input aria-label="Search projects" value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search projects…" className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          {listError && <p role="alert" className="mt-3 text-sm text-destructive">{listError.message}</p>}
          {isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : visibleProjects.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No projects yet. Create your first one above.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {visibleProjects.map((p: any) => (
                <li key={p.id}>
                  <Link to="/dub/projects/$id" params={{ id: p.id }}
                    className="flex items-center justify-between py-3 hover:bg-accent/40 -mx-2 px-2 rounded-lg">
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.source_lang ?? "auto"} → {p.target_lang ?? "—"} · {p.status}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(s);
}
