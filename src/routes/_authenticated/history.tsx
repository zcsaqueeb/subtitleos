import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Trash2, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { getTranslation, deleteTranslation } from "@/lib/translate.functions";
import { useActivity, localActivityOutput, removeLocalActivity, downloadActivity, type Activity } from "@/components/activity-data";
import { PageHeading, EmptyActivity, StatusLabel } from "@/components/workspace-ui";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History — SubtitleOS" }, { name: "description", content: "Find, download and manage saved subtitle translations, batches and transcripts." }, { property: "og:title", content: "History — SubtitleOS" }, { property: "og:description", content: "Find, download and manage saved subtitle translations, batches and transcripts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <AppShell><History /></AppShell>,
});
function History() {
  const { rows, error, refresh } = useActivity();
  const get = useServerFn(getTranslation); const del = useServerFn(deleteTranslation);
  const [q, setQ] = useState(""); const [status, setStatus] = useState("all"); const [kind, setKind] = useState("all"); const [date, setDate] = useState(""); const [page, setPage] = useState(1); const [busy, setBusy] = useState<string | null>(null); const [pending, setPending] = useState<Activity | null>(null);
  const filtered = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()) && (status === "all" || r.status === status) && (kind === "all" || r.kind === kind) && (!date || new Date(r.createdAt).toLocaleDateString("en-CA") === new Date(`${date}T12:00:00`).toLocaleDateString("en-CA")));
  const pages = Math.max(1, Math.ceil(filtered.length / 10)); const current = Math.min(page, pages); const active = !!q || status !== "all" || kind !== "all" || !!date;
  async function download(r: Activity) {
    setBusy(`${r.kind}-${r.id}`);
    try {
      let blob: Blob | null;
      if (r.kind === "translation") { const result = await get({ data: { id: r.id } }); blob = result?.translated_text ? new Blob([result.translated_text], { type: "text/plain;charset=utf-8" }) : null; }
      else blob = await localActivityOutput(r);
      if (!blob) throw new Error("The saved output is no longer available on this device.");
      downloadActivity(blob, r.kind === "batch" ? `subtitles.${r.targetLang}.zip` : `${r.name.replace(/\.[^.]+$/, "")}.${r.targetLang}.srt`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); } finally { setBusy(null); }
  }
  async function remove(r: Activity) {
    setBusy(`${r.kind}-${r.id}`);
    try { if (r.kind === "translation") await del({ data: { id: r.id } }); else await removeLocalActivity(r); refresh(); setPending(null); toast.success("Saved activity deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); } finally { setBusy(null); }
  }
  return <div className="space-y-6"><PageHeading eyebrow="Your studio" title="History" description="Your saved translations, subtitle batches and transcripts." actions={<Button variant="outline" size="icon" title="Refresh history" aria-label="Refresh history" onClick={refresh}><RefreshCw /></Button>} />
    <div className="flex flex-wrap gap-3"><div className="relative min-w-0 basis-full sm:flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search saved files" placeholder="Search files…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} className="pl-9" /></div><Select value={kind} onValueChange={v => { setKind(v); setPage(1); }}><SelectTrigger aria-label="Activity type" className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent>{[["all", "All types"], ["translation", "Translations"], ["batch", "Batches"], ["transcript", "Transcripts"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}><SelectTrigger aria-label="Activity status" className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent>{[["all", "All statuses"], ["completed", "Completed"], ["failed", "Failed"], ["running", "Running"], ["paused", "Paused"], ["stopped", "Stopped"], ["processing", "Processing"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><Input type="date" aria-label="Activity date" value={date} onChange={e => { setDate(e.target.value); setPage(1); }} className="w-full sm:w-40" />{active && <Button variant="ghost" onClick={() => { setQ(""); setStatus("all"); setKind("all"); setDate(""); setPage(1); }}>Clear filters</Button>}</div>
    <p className="text-xs text-muted-foreground">{filtered.length} saved jobs · Browser-saved files stay on this device; unsaved guest translations are not retained.</p>
    {error && <p role="alert" className="text-sm text-destructive">Some activity couldn't be read. Try refreshing.</p>}
    {pending && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4"><p className="min-w-0 flex-1 break-words text-sm">Delete “{pending.name}” and its saved output? This cannot be undone.</p><div className="flex gap-2"><Button variant="outline" disabled={!!busy} onClick={() => setPending(null)}>Cancel</Button><Button variant="destructive" disabled={!!busy} onClick={() => remove(pending)}>Delete</Button></div></div>}
    {!filtered.length ? <EmptyActivity filtered={active} /> : <ul className="divide-y divide-border border-y border-border">{filtered.slice((current - 1) * 10, current * 10).map(r => <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center gap-4 py-4"><div className="min-w-0 basis-full sm:flex-1"><div className="flex flex-wrap items-center gap-2"><p className="max-w-full truncate font-medium">{r.name}</p><StatusLabel status={r.status} /></div><p className="mt-2 text-xs text-muted-foreground capitalize">{r.kind} · {r.sourceLang.toUpperCase()} → {r.targetLang.toUpperCase()} · {r.count} {r.count === 1 ? "file" : "files"} · {new Date(r.createdAt).toLocaleString()}</p>{r.error && <p className="mt-1 break-words text-xs text-destructive">{r.error}</p>}</div><Button variant="outline" size="sm" disabled={busy === `${r.kind}-${r.id}` || (r.kind === "translation" ? r.status !== "completed" : r.kind === "transcript" ? !r.text : false)} onClick={() => download(r)}><Download /> Download</Button><Button variant="ghost" size="icon" className="text-destructive" aria-label={`Delete ${r.name}`} title="Delete saved activity" disabled={!!busy} onClick={() => setPending(r)}><Trash2 /></Button></li>)}</ul>}
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Page {current} of {pages}</span><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Previous page" title="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Next page" title="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronRight /></Button></div></div>
  </div>;
}
