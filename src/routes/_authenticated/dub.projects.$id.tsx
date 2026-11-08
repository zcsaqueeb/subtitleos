import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Lock, LockOpen, Trash2, Plus, Wand2, RefreshCw, Users2, Languages, Download, CheckSquare, Square, Upload, Video, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import {
  getDubProject, updateDubCharacter, addDubCharacter, deleteDubCharacter,
  updateDubLine, renderDubLine, renderDubProject, translateDubProject, exportDubProject,
  validateDubProject, getDubProgress, updateDubProjectMeta,
} from "@/lib/dub-projects.functions";
import { previewVoice, createLipSyncUpload, startLipSync, pollLipSync } from "@/lib/dub.functions";
import { CHARACTER_TYPES, EMOTIONS, labelForType, defaultVoiceForType } from "@/lib/dub-character-types";
import { STYLE_PRESETS } from "@/lib/translation/style-presets";
import { getUserElevenLabsKey, getUserSyncSoKey } from "@/lib/user-connectors";
import { saveCloneSample, hasCloneSample, synthesizeBrowser, blobToDataUrl } from "@/lib/browser-clone";

export const Route = createFileRoute("/_authenticated/dub/projects/$id")({
  head: () => ({ meta: [
      { name: "description", content: "Edit character voices, review dialogue, and manage a SubtitleOS dubbing project." },
      { property: "og:title", content: "Dubbing Project \u2014 SubtitleOS" },
      { property: "og:description", content: "Edit character voices, review dialogue, and manage a SubtitleOS dubbing project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
{ title: "Dubbing Project — SubtitleOS" }] }),
  component: DubProjectPage,
  errorComponent: ({ error, reset }) => (
    <AppShell><div className="mx-auto max-w-3xl p-6">
      <BackButton />
      <p className="text-sm text-destructive">Error: {String((error as { message?: string })?.message ?? error)}</p>
      <Button variant="outline" onClick={() => reset()} className="mt-3 rounded-md border px-3 py-1.5 text-xs">Retry</Button>
    </div></AppShell>
  ),
  notFoundComponent: () => (
    <AppShell><div className="mx-auto max-w-3xl p-6"><BackButton /><p className="text-sm">Project not found.</p></div></AppShell>
  ),
});

function DubProjectPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const fetchProject = useServerFn(getDubProject);
  const { data, isLoading, refetch, error: projectError } = useQuery({
    queryKey: ["dub-project", id],
    queryFn: () => fetchProject({ data: { projectId: id } }),
  });
  const updateChar = useServerFn(updateDubCharacter);
  const addChar = useServerFn(addDubCharacter);
  const delChar = useServerFn(deleteDubCharacter);
  const updateLine = useServerFn(updateDubLine);
  const renderLine = useServerFn(renderDubLine);
  const renderAll = useServerFn(renderDubProject);
  const translateAll = useServerFn(translateDubProject);
  const exportAll = useServerFn(exportDubProject);
  const validate = useServerFn(validateDubProject);
  const getProgress = useServerFn(getDubProgress);
  const preview = useServerFn(previewVoice);

  const [operationError, setOperationError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetLang, setTargetLang] = useState<string>("");
  const [stylePreset, setStylePreset] = useState<string>("dub");
  const [search, setSearch] = useState("");
  const [filterChar, setFilterChar] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "missing_tx" | "missing_audio" | "unassigned">("all");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (data?.project) {
      setTargetLang(data.project.target_lang ?? "");
      setStylePreset(data.project.style_preset ?? "dub");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.project?.id]);

  const characters = data?.characters ?? [];
  const lines = data?.lines ?? [];
  const charById = useMemo(() => new Map(characters.map((c: any) => [c.id, c])), [characters]);
  const colorForChar = (cid?: string | null) => {
    if (!cid) return "hsl(0 0% 60%)";
    let h = 0; for (let i = 0; i < cid.length; i++) h = (h * 31 + cid.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360} 70% 55%)`;
  };
  const visibleLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l: any) => {
      if (filterChar === "unassigned" && l.character_id) return false;
      if (filterChar !== "all" && filterChar !== "unassigned" && l.character_id !== filterChar) return false;
      if (filterStatus === "missing_tx" && l.translated_text) return false;
      if (filterStatus === "missing_audio" && l.audio_url) return false;
      if (filterStatus === "unassigned" && l.character_id) return false;
      if (q) {
        const hay = `${l.text ?? ""} ${l.translated_text ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lines, search, filterChar, filterStatus]);


  const { data: validation, refetch: refetchValidation } = useQuery({
    queryKey: ["dub-validation", id],
    queryFn: () => validate({ data: { projectId: id } }),
    enabled: !!data?.project,
    refetchOnWindowFocus: false,
  });

  const [bulkBusy, setBulkBusyState] = useState(false);
  const setBulkBusy = (b: boolean) => setBulkBusyState(b);
  const { data: progress } = useQuery({
    queryKey: ["dub-progress", id],
    queryFn: () => getProgress({ data: { projectId: id } }),
    enabled: bulkBusy,
    refetchInterval: bulkBusy ? 1000 : false,
  });

  async function saveChar(id: string, patch: any) {
    try { await updateChar({ data: { characterId: id, ...patch } }); await refetch(); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Could not save character."); }
  }
  async function saveLine(id: string, patch: any) {
    try { await updateLine({ data: { lineId: id, ...patch } }); await refetch(); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Could not save dialogue."); }
  }
  async function playPreview(voiceId: string) {
    if (previewBusy) return; setPreviewBusy(true);
    try {
      const key = getUserElevenLabsKey();
      const r = await preview({ data: { voice: "alloy", clonedVoiceId: voiceId, language: data?.project?.target_lang ?? "en", userElevenLabsKey: key } });
      const audio = new Audio(`data:${r.mime};base64,${r.base64}`);
      audioRef.current?.pause();
      audioRef.current = audio;
      await audio.play();
    } catch (e: any) { setOperationError(e?.message ?? "Preview failed"); } finally { setPreviewBusy(false); }
  }
  async function playLine(url: string) {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    try { await audio.play(); } catch (error) { setOperationError(error instanceof Error ? error.message : "Could not play dialogue."); }
  }
  async function renderOne(lineId: string) {
    setRenderingIds((s) => new Set(s).add(lineId));
    try {
      const line = lines.find((l: any) => l.id === lineId);
      const character = line ? charById.get(line.character_id) as any : null;
      if (character?.clone_provider === "browser") {
        // Client-side, on-device synthesis via @huggingface/transformers.
        const text = (line.translated_text ?? line.text ?? "").toString();
        if (!text.trim()) throw new Error("Empty line");
        const blob = await synthesizeBrowser({ text, characterId: character.id });
        const dataUrl = await blobToDataUrl(blob);
        await updateLine({ data: { lineId, /* store audio via updateDubLine trick */ } as any });
        // updateDubLine invalidates audio_url when text changes; store URL directly via a raw update:
        // Use the dedicated raw column update through the character-agnostic save path.
        // Simplest: reuse updateDubLine but set translated_text to itself to trigger the update,
        // then patch audio_url separately through a small helper endpoint.
        // For now, drop into the same path as server render by writing the data URL back via updateDubLine's audio_url invalidation would clobber it. So use saveChar-style direct call:
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase.from("dub_lines").update({ audio_url: dataUrl }).eq("id", lineId);
        await refetch(); refetchValidation();
      } else {
        const key = getUserElevenLabsKey();
        await renderLine({ data: { lineId, userElevenLabsKey: key } });
        await refetch(); refetchValidation();
      }
    } catch (e: any) { setOperationError(e?.message ?? "Render failed"); }
    finally { setRenderingIds((s) => { const n = new Set(s); n.delete(lineId); return n; }); }
  }
  async function renderProject(onlyMissing: boolean, lineIds?: string[]) {
    setBulkBusy(true);
    try {
      const key = getUserElevenLabsKey();
      // Server fn doesn't accept lineIds; fallback: render individually for selection subset
      if (lineIds && lineIds.length) {
        let done = 0, failed = 0;
        for (const lineId of lineIds) {
          try { await renderLine({ data: { lineId, userElevenLabsKey: key } }); done++; }
          catch (error) { failed++; setOperationError(error instanceof Error ? error.message : "Line rendering failed."); break; }
        }
        toast.success(`Rendered ${done}/${lineIds.length}${failed ? `, ${failed} failed` : ""}.`);
      } else {
        const r = await renderAll({ data: { projectId: id, onlyMissing, userElevenLabsKey: key } });
        toast.success(`Rendered ${r.rendered}/${r.total} lines${r.failed ? `, ${r.failed} failed` : ""}.`);
      }
      await refetch(); refetchValidation();
    } catch (e: any) { setOperationError(e?.message ?? "Render failed"); }
    finally { setBulkBusy(false); }
  }
  async function translateProject(onlyMissing: boolean, lineIds?: string[]) {
    if (!targetLang) { toast.error("Set a target language first."); return; }
    setBulkBusy(true);
    try {
      const r = await translateAll({ data: {
        projectId: id, lineIds, targetLang, stylePreset,
        sourceLang: data?.project?.source_lang ?? undefined, onlyMissing,
      } });
      toast.success(`Translated ${r.translated}/${r.total} lines${r.failed ? `, ${r.failed} failed` : ""}.`);
      await refetch(); refetchValidation();
    } catch (e: any) { setOperationError(e?.message ?? "Translation failed"); }
    finally { setBulkBusy(false); }
  }
  function downloadBlob(name: string, data: string, mime: string) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportProject(useTranslation: boolean) {
    setBulkBusy(true);
    try {
      const r = await exportAll({ data: { projectId: id, useTranslation } });
      const base = (data?.project?.name || "dub-project").replace(/[^a-z0-9-_]+/gi, "_");
      downloadBlob(`${base}.${useTranslation ? "translated" : "source"}.srt`, r.srt, "application/x-subrip");
      downloadBlob(`${base}.manifest.json`, JSON.stringify(r.manifest, null, 2), "application/json");
      toast.success("Exported SRT + audio manifest.");
    } catch (e: any) { setOperationError(e?.message ?? "Export failed"); }
    finally { setBulkBusy(false); }
  }
  function toggleSelect(lineId: string) {
    setSelected((s) => { const n = new Set(s); n.has(lineId) ? n.delete(lineId) : n.add(lineId); return n; });
  }
  function toggleSelectAll() {
    setSelected((s) => {
      const visIds = visibleLines.map((l: any) => l.id);
      const allSelected = visIds.every((id: string) => s.has(id));
      const next = new Set(s);
      if (allSelected) { for (const id of visIds) next.delete(id); }
      else { for (const id of visIds) next.add(id); }
      return next;
    });
  }


  useEffect(() => () => { audioRef.current?.pause(); }, []);

  if (projectError) return <AppShell><div className="p-6 space-y-3"><BackButton /><p role="alert" className="text-sm text-destructive">{projectError.message}</p><Button variant="outline" onClick={() => refetch()}>Retry project</Button></div></AppShell>;
  if (isLoading) return <AppShell><div className="p-6 text-sm text-muted-foreground">Loading project…</div></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <BackButton />
        {operationError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm break-words">{operationError}<Button variant="outline" onClick={() => setOperationError("")} className="ml-2">Dismiss</Button></div>}
        <header
          className="relative overflow-hidden rounded-2xl border border-primary/40 p-5"
          style={{
            background:
              "radial-gradient(ellipse at top right, color-mix(in oklab, var(--primary) 28%, transparent), transparent 60%), linear-gradient(135deg, var(--card), var(--background))",
          }}
        >
          <div className="absolute right-4 top-4 hidden sm:flex -space-x-2 opacity-80">
            {[0,1,2,3].map((i) => (
              <div key={i} className="h-8 w-8 rounded-full border-2 border-card bg-gradient-to-br from-primary/70 to-primary/30 ring-1 ring-primary/40" />
            ))}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary ring-1 ring-primary/40">
                <Users2 className="h-6 w-6" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                  Multi-Character Studio · Timeline
                </div>
                <h1 className="mt-1 font-display text-3xl leading-tight">{data?.project?.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{data?.project?.source_lang ?? "auto"} → {data?.project?.target_lang ?? "—"}</span>
                  <span className="rounded-md bg-primary/15 px-2 py-0.5 font-medium text-primary">{characters.length} characters</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{lines.length} lines</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-medium capitalize">{data?.project?.status}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Per-character voices, emotions, and manual line-by-line editing. For one-shot narrator dubs, use <a href="/dub" className="text-gold underline underline-offset-2">Voice Dubbing</a>.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => renderProject(true)} disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                style={{ boxShadow: "var(--shadow-gold)" }}>
                <Wand2 className="h-4 w-4" /> {bulkBusy ? "Rendering…" : "Render missing"}
              </Button>
              <Button variant="outline" onClick={() => renderProject(false)} disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50">
                <RefreshCw className="h-4 w-4" /> Re-render all
              </Button>
            </div>
          </div>
        </header>

        {/* Live progress bar (during any bulk action) */}
        {bulkBusy && (
          <div className="rounded-2xl border border-gold/40 bg-card p-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">
                {progress?.progress?.stage === "batch_done" ? "Finalizing…" : "Working…"}
                {progress?.progress?.message ? ` · ${progress.progress.message}` : ""}
              </span>
              <span className="tabular-nums text-muted-foreground">{progress?.progress?.pct ?? 0}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress?.progress?.pct ?? 0}%` }} />
            </div>
          </div>
        )}

        {/* Validation gate */}
        {validation && (() => {
          const v = validation;
          const tone = v.ok ? "border-emerald-500/40 bg-emerald-500/5" : v.missingLineIds.length ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5";
          const chip = v.ok ? "bg-emerald-500/15 text-emerald-500" : v.missingLineIds.length ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-500";
          const label = v.ok ? "Ready to export" : v.missingLineIds.length ? "Incomplete" : "Warnings";
          return (
            <div className={`rounded-2xl border ${tone} p-3 text-xs`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 font-medium ${chip}`}>{label}</span>
                <span className="text-muted-foreground">{v.dubbedLines}/{v.totalLines} dubbed · drift {Math.round(v.driftMs)} ms</span>
                {!v.ok && v.missingLineIds.length > 0 && (
                  <Button variant="outline" onClick={() => renderProject(true)} disabled={bulkBusy}
                    className="ml-auto rounded-md border border-border px-2 py-1 hover:bg-accent disabled:opacity-50">
                    Fix {v.missingLineIds.length} missing
                  </Button>
                )}
              </div>
              {!v.ok && v.issues.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {v.issues.slice(0, 3).map((i: any, k: number) => <li key={k}>{i.message}</li>)}
                  {v.issues.length > 3 && <li>+ {v.issues.length - 3} more…</li>}
                </ul>
              )}
            </div>
          );
        })()}

        {/* Translation & Export toolbar */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <label className="text-muted-foreground">Target</label>
              <input value={targetLang} onChange={(e) => setTargetLang(e.target.value)} placeholder="e.g. es, hi, ja"
                className="w-24 rounded-md border border-border bg-background px-2 py-1 focus:border-gold/60 focus:outline-none" />
              <label className="text-muted-foreground ml-2">Style</label>
              <select value={stylePreset} onChange={(e) => setStylePreset(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1">
                {STYLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => translateProject(true)} disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                <Languages className="h-3.5 w-3.5" /> Translate missing
              </Button>
              <Button variant="outline" onClick={() => translateProject(false, selected.size ? Array.from(selected) : undefined)} disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                <Languages className="h-3.5 w-3.5" /> {selected.size ? `Translate ${selected.size} selected` : "Re-translate all"}
              </Button>
              <Button variant="outline" onClick={() => renderProject(false, selected.size ? Array.from(selected) : undefined)} disabled={bulkBusy || !selected.size}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                <Wand2 className="h-3.5 w-3.5" /> Re-dub {selected.size || 0} selected
              </Button>
              <Button variant="outline" onClick={() => exportProject(true)} disabled={bulkBusy || !validation?.ok}
                title={validation?.ok ? "" : (validation?.issues?.[0]?.message ?? "Complete all missing lines to enable export")}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> Export SRT + manifest
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Translation is character-aware: each speaker keeps a consistent register and personality across the whole project. Selecting lines below scopes re-translate and re-dub to only those cues.
          </p>
        </section>


        {/* Character Voice Mapping */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display text-lg flex items-center gap-2"><Users2 className="h-4 w-4" /> Character Voice Mapping</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline"
                onClick={async () => {
                  const targets = characters.filter((c: any) => !c.locked);
                  if (!targets.length) { toast.message("All characters are already locked."); return; }
                  await Promise.all(targets.map((c: any) => updateChar({ data: { characterId: c.id, locked: true } })));
                  toast.success(`Locked ${targets.length} voice${targets.length === 1 ? "" : "s"}.`);
                  refetch();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                <Lock className="h-3 w-3" /> Lock all
              </Button>
              <Button variant="outline"
                onClick={async () => {
                  const targets = characters.filter((c: any) => c.locked);
                  if (!targets.length) { toast.message("No locked characters."); return; }
                  await Promise.all(targets.map((c: any) => updateChar({ data: { characterId: c.id, locked: false } })));
                  toast.success(`Unlocked ${targets.length} voice${targets.length === 1 ? "" : "s"}.`);
                  refetch();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                <LockOpen className="h-3 w-3" /> Unlock all
              </Button>
              <AddCharacterInline onAdd={async (name) => { await addChar({ data: { projectId: id, name, character_type: "neutral" } }); refetch(); }} />
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Character</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Clone provider</th>
                  <th className="text-left py-2">Voice</th>
                  <th className="text-left py-2 w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((c: any) => (
                  <Fragment key={c.id}>
                  <tr key={c.id} className="border-b border-border/40">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorForChar(c.id) }} />
                        <input defaultValue={c.name}
                          onBlur={(e) => e.target.value !== c.name && saveChar(c.id, { name: e.target.value })}
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-border focus:border-gold/60 focus:outline-none" />
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <select value={c.character_type} disabled={c.locked}
                        onChange={(e) => saveChar(c.id, { character_type: e.target.value, voice_id: defaultVoiceForType(e.target.value) })}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50">
                        {CHARACTER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <CloneProviderCell character={c} onChange={(cp) => saveChar(c.id, { clone_provider: cp })} />
                    </td>
                    <td className="py-2 pr-2">
                      <input defaultValue={c.voice_id ?? ""} disabled={c.locked || c.clone_provider === "browser"}
                        placeholder={c.clone_provider === "browser" ? "(on-device)" : "ElevenLabs voice_id"}
                        onBlur={(e) => e.target.value !== (c.voice_id ?? "") && saveChar(c.id, { voice_id: e.target.value || null })}
                        className="w-52 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs disabled:opacity-50" />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" disabled={previewBusy || !c.voice_id} title="Preview voice" onClick={() => c.voice_id && playPreview(c.voice_id)}
                          className="rounded-md border border-border p-1.5 hover:bg-accent"><Play className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" title={c.locked ? "Unlock" : "Lock voice"}
                          onClick={() => saveChar(c.id, { locked: !c.locked })}
                          className={`rounded-md border p-1.5 ${c.locked ? "border-gold/60 bg-gold/10 text-gold" : "border-border hover:bg-accent"}`}>
                          {c.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="outline" title="Delete character" onClick={async () => {
                          if (!confirm(`Delete character "${c.name}"? Lines stay but become unassigned.`)) return;
                          await delChar({ data: { characterId: c.id } }); refetch();
                        }} className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  <tr key={c.id + ":persona"} className="border-b border-border/60">
                    <td colSpan={5} className="pb-2 pl-6 pr-2">
                      <input
                        defaultValue={c.sample_line ?? ""}
                        placeholder="Persona brief (e.g. 'gruff detective, dry humor, low register') — used by translation & TTS instructions"
                        onBlur={(e) => e.target.value !== (c.sample_line ?? "") && saveChar(c.id, { sample_line: e.target.value || null })}
                        className="w-full rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs italic text-muted-foreground focus:border-gold/60 focus:outline-none"
                      />
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Voices are persistent per character. Once locked, "Re-render all" reuses the same voice_id. Default voices come from ElevenLabs; paste a custom voice_id (including your cloned voices) to override.
          </p>
        </section>

        {/* Lines */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg">Dialogue lines</h2>
            <Button variant="outline" onClick={toggleSelectAll} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
              {visibleLines.length > 0 && visibleLines.every((l: any) => selected.has(l.id))
                ? <><CheckSquare className="h-3.5 w-3.5" /> Deselect visible</>
                : <><Square className="h-3.5 w-3.5" /> Select visible</>}
              {selected.size > 0 && <span className="text-muted-foreground">({selected.size})</span>}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-2 text-xs">
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dialogue or translation…"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 focus:border-gold/60 focus:outline-none"
            />
            <select value={filterChar} onChange={(e) => setFilterChar(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1">
              <option value="all">All characters</option>
              <option value="unassigned">Unassigned</option>
              {characters.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}
              className="rounded-md border border-border bg-background px-2 py-1">
              <option value="all">All status</option>
              <option value="missing_tx">Missing translation</option>
              <option value="missing_audio">Missing audio</option>
              <option value="unassigned">Unassigned character</option>
            </select>
            <span className="text-muted-foreground">{visibleLines.length}/{lines.length} shown</span>
            {(search || filterChar !== "all" || filterStatus !== "all") && (
              <Button variant="outline" onClick={() => { setSearch(""); setFilterChar("all"); setFilterStatus("all"); }}
                className="rounded-md border border-border px-2 py-1 hover:bg-accent">Reset</Button>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {visibleLines.length === 0 && (
              <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">No lines match the current filters.</p>
            )}
            {visibleLines.map((l: any) => {
              const c = charById.get(l.character_id) as any | undefined;
              const rendering = renderingIds.has(l.id);
              const isSel = selected.has(l.id);
              return (
                <div key={l.id} className={`rounded-xl border p-3 ${isSel ? "border-gold/60 bg-gold/5" : "border-border"}`}
                  style={{ borderLeftWidth: 3, borderLeftColor: colorForChar(l.character_id) }}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Button variant="outline" onClick={() => toggleSelect(l.id)} title={isSel ? "Deselect" : "Select"}
                      className="rounded p-0.5 hover:bg-accent">
                      {isSel ? <CheckSquare className="h-3.5 w-3.5 text-gold" /> : <Square className="h-3.5 w-3.5" />}
                    </Button>
                    <span className="font-mono">#{l.idx + 1}</span>
                    <select value={l.character_id ?? ""} onChange={(e) => saveLine(l.id, { character_id: e.target.value || null })}
                      className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs">
                      <option value="">— unassigned —</option>
                      {characters.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name} ({labelForType(ch.character_type)})</option>)}
                    </select>
                    <select value={l.emotion ?? "neutral"} onChange={(e) => saveLine(l.id, { emotion: e.target.value })}
                      className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs capitalize">
                      {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                    {l.start_ms != null && <span className="font-mono">{fmt(l.start_ms)} → {fmt(l.end_ms ?? l.start_ms)}</span>}
                    <Button variant="outline" onClick={() => saveLine(l.id, { locked: !l.locked })}
                      className={`ml-auto rounded-md border px-1.5 py-0.5 text-[11px] ${l.locked ? "border-gold/60 bg-gold/10 text-gold" : "border-border hover:bg-accent"}`}>
                      {l.locked ? "Locked" : "Unlocked"}
                    </Button>
                  </div>
                  <textarea defaultValue={l.text} rows={1}
                    onBlur={(e) => e.target.value !== l.text && saveLine(l.id, { text: e.target.value })}
                    dir="auto" aria-label={`Source line ${l.idx + 1}`} disabled={bulkBusy || rendering} className="mt-2 w-full resize-y min-h-16 rounded-md border border-border bg-background/60 px-2 py-1.5 text-sm focus:border-gold/60 focus:outline-none" />
                  {l.translated_text != null && (
                    <textarea defaultValue={l.translated_text} rows={1} placeholder="Translation"
                      onBlur={(e) => e.target.value !== l.translated_text && saveLine(l.id, { translated_text: e.target.value })}
                      dir="auto" aria-label={`Translation line ${l.idx + 1}`} disabled={bulkBusy || rendering} className="mt-1 w-full resize-y min-h-16 rounded-md border border-border bg-background/40 px-2 py-1.5 text-sm italic text-muted-foreground focus:border-gold/60 focus:outline-none" />
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="outline" onClick={() => renderOne(l.id)} disabled={rendering || bulkBusy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50">
                      <Wand2 className="h-3 w-3" /> {rendering ? "Rendering…" : l.audio_url ? "Re-render" : "Render"}
                    </Button>
                    {l.audio_url && (
                      <Button variant="outline" onClick={() => playLine(l.audio_url)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                        <Play className="h-3 w-3" /> Play
                      </Button>
                    )}
                    {c && <span className="text-[11px] text-muted-foreground">Voice: {c.name} — <span className="font-mono">{(c.voice_id ?? "").slice(0, 12)}…</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {data?.project?.source_video_path && (
          <LipSyncSection projectId={id} project={data.project} lines={lines} />
        )}
      </div>
    </AppShell>
  );
}

function CloneProviderCell({ character, onChange }: { character: any; onChange: (cp: "elevenlabs" | "browser") => void }) {
  const [hasSample, setHasSample] = useState(false);
  useEffect(() => { hasCloneSample(character.id).then(setHasSample); }, [character.id]);
  const cp = (character.clone_provider ?? "elevenlabs") as "elevenlabs" | "browser";
  return (
    <div className="flex items-center gap-1">
      <select value={cp} disabled={character.locked}
        onChange={(e) => onChange(e.target.value as any)}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50">
        <option value="elevenlabs">ElevenLabs (cloud)</option>
        <option value="browser">Browser (open source)</option>
      </select>
      {cp === "browser" && (
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] hover:bg-accent" title="Upload a 5-30s sample; stored on-device.">
          <Upload className="h-3 w-3" /> {hasSample ? "Replace" : "Sample"}
          <input type="file" accept="audio/*" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              await saveCloneSample(character.id, f);
              setHasSample(true);
              toast.success("Sample saved on-device.");
            }} />
        </label>
      )}
    </div>
  );
}

function LipSyncSection({ projectId, project, lines }: { projectId: string; project: any; lines: any[] }) {
  const signUpload = useServerFn(createLipSyncUpload);
  const start = useServerFn(startLipSync);
  const poll = useServerFn(pollLipSync);
  const saveMeta = useServerFn(updateDubProjectMeta);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [outUrl, setOutUrl] = useState<string | null>(project.final_video_url ?? null);

  async function run() {
    const withAudio = lines.filter((l: any) => l.audio_url && l.start_ms != null && l.end_ms != null)
      .sort((a: any, b: any) => a.start_ms - b.start_ms);
    if (!withAudio.length) { toast.error("Render dubbed audio for at least some lines first."); return; }
    setBusy(true);
    try {
      setStep("Mixing dubbed audio timeline…");
      const totalMs = Math.max(...withAudio.map((l: any) => l.end_ms));
      const sr = 44100;
      const ctx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, Math.ceil((totalMs / 1000) * sr), sr);
      for (const l of withAudio) {
        try {
          const r = await fetch(l.audio_url);
          if (!r.ok) throw new Error(`Audio download failed (${r.status})`);
          const buf = await r.arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf.slice(0));
          const src = ctx.createBufferSource(); src.buffer = decoded;
          src.connect(ctx.destination); src.start(l.start_ms / 1000);
        } catch (error) { throw new Error(`Could not mix line ${l.idx + 1}: ${error instanceof Error ? error.message : "Audio unavailable"}`); }
      }
      const rendered = await ctx.startRendering();
      const wav = pcmToWav(rendered.getChannelData(0), sr);

      setStep("Uploading audio track…");
      const { audio } = await signUpload({ data: { videoName: project.source_video_name ?? "video.mp4" } });
      const up = await fetch(audio.signedUrl, { method: "PUT", body: wav, headers: { "Content-Type": "audio/wav" } });
      if (!up.ok) throw new Error(`Audio upload failed (${up.status})`);

      setStep("Starting lip-sync…");
      const { jobId } = await start({ data: {
        videoName: project.source_video_name ?? "video.mp4",
        videoPath: project.source_video_path, audioPath: audio.path,
        model: "lipsync-2",
         userSyncSoKey: getUserSyncSoKey(),
      } });
      await saveMeta({ data: { projectId, lipsync_job_id: jobId, lipsync_status: "PROCESSING" } });

      // Poll
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        setStep(`Lip-sync in progress… (${Math.round(i * 5 / 60)}m)`);
        const p = await poll({ data: { jobId, userSyncSoKey: getUserSyncSoKey() } });
        if (p.status === "COMPLETED" && p.outputUrl) {
          setOutUrl(p.outputUrl);
          await saveMeta({ data: { projectId, final_video_url: p.outputUrl, lipsync_status: "COMPLETED" } });
          toast.success("Lip-synced video ready.");
          return;
        }
        if (p.status === "FAILED" || p.error) throw new Error(p.error ?? "Lip-sync failed");
      }
      throw new Error("Lip-sync timed out");
    } catch (e: any) {
      toast.error(e?.message ?? "Lip-sync failed");
    } finally { setBusy(false); setStep(""); }
  }

  return (
    <section className="rounded-2xl border border-primary/40 bg-card p-5">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg">Final lip-synced video</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Mixes all rendered per-line audio onto the original video's timeline and runs a lip-sync pass.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" onClick={run} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          style={{ boxShadow: "var(--shadow-gold)" }}>
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {step || "Working…"}</> : "Render lip-synced video"}
        </Button>
        {outUrl && (
          <a href={outUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> Download final video
          </a>
        )}
      </div>
    </section>
  );
}

function pcmToWav(pcm: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.length * 2, true);
  let o = 44;
  for (let i = 0; i < pcm.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

function AddCharacterInline({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await onAdd(name.trim()); setName(""); }} className="flex items-center gap-1">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add character…"
        className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-gold/60 focus:outline-none" />
      <Button variant="outline" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
        <Plus className="h-3 w-3" /> Add
      </Button>
    </form>
  );
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000); const mm = Math.floor(s / 60).toString().padStart(2, "0"); const ss = (s % 60).toString().padStart(2, "0");
  const cs = Math.floor((ms % 1000) / 10).toString().padStart(2, "0");
  return `${mm}:${ss}.${cs}`;
}
