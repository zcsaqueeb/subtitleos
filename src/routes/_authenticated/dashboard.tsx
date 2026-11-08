import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, RefreshCw, FileText, Languages, CheckCircle2, AlertCircle, Mic, Users, Plug } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useActivity } from "@/components/activity-data";
import { PageHeading, EmptyActivity, StatusLabel } from "@/components/workspace-ui";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SubtitleOS" }, { name: "description", content: "Your saved subtitle activity, languages and studio projects in SubtitleOS." }, { property: "og:title", content: "Dashboard — SubtitleOS" }, { property: "og:description", content: "Your saved subtitle activity, languages and studio projects in SubtitleOS." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <AppShell><Dashboard /></AppShell>,
});
function Dashboard() {
  const { rows, error, refresh } = useActivity();
  const [period, setPeriod] = useState("all");
  const now = Date.now();
  const activity = rows.filter(r => period === "all" || now - r.createdAt <= (period === "week" ? 7 : 30) * 86400000);
  const total = activity.reduce((n, r) => n + r.count, 0);
  const completed = activity.filter(r => r.status === "completed").reduce((n, r) => n + r.count, 0);
  const languages = new Set(activity.map(r => r.targetLang).filter(l => l && l !== "—" && l !== "auto"));
  const metrics = [
    { label: "Saved files", value: total, icon: FileText },
    { label: "Completed jobs", value: activity.filter(r => r.status === "completed").length, icon: CheckCircle2 },
    { label: "Output languages", value: languages.size, icon: Languages },
    { label: "Needs attention", value: activity.filter(r => r.status === "failed").length, icon: AlertCircle },
  ];
  return <div className="space-y-7">
    <PageHeading eyebrow="Your studio" title="Dashboard" description="A clear view of your saved work and recent activity." actions={<><Button variant="outline" size="icon" aria-label="Refresh activity" title="Refresh activity" onClick={refresh}><RefreshCw /></Button><Button asChild><Link to="/app">New translation <ArrowUpRight /></Link></Button></>} />
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Activity overview</h2><div className="flex flex-wrap gap-1" role="group" aria-label="Activity period">{[["all", "All time"], ["month", "30 days"], ["week", "7 days"]].map(([id, label]) => <Button key={id} size="sm" variant={period === id ? "secondary" : "ghost"} aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</Button>)}</div></div>
    {error && <p role="alert" className="text-sm text-destructive">Some saved activity couldn't be read. <Button variant="link" onClick={refresh}>Try again</Button></p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-lg border border-border bg-card p-5"><div className="flex justify-between gap-3 text-xs text-muted-foreground">{label}<Icon className="size-4 text-primary" /></div><div className="mt-4 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</div></div>)}</div>
    <section className="grid gap-8 border-y border-border py-6 lg:grid-cols-2"><div><h2 className="font-medium">Saved outputs</h2><p className="mt-2 text-sm text-muted-foreground">{completed.toLocaleString()} files in completed jobs · {activity.filter(r => r.kind === "transcript").length} transcripts</p><p className="mt-3 text-xs text-muted-foreground">Browser-saved work stays on this device. Unsaved guest translations are not included.</p></div><div><h2 className="font-medium">Languages in your projects</h2><div className="mt-3 flex flex-wrap gap-2">{languages.size ? [...languages].map(l => <span key={l} className="rounded-md bg-muted px-3 py-1 font-mono text-xs uppercase">{l}</span>) : <span className="text-sm text-muted-foreground">No saved languages yet.</span>}</div></div></section>
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-medium">Recent activity</h2><Button asChild variant="link"><Link to="/history">View history <ArrowUpRight /></Link></Button></div>{!activity.length ? <EmptyActivity /> : <ul className="divide-y divide-border">{activity.slice(0, 5).map(r => <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.name}</p><p className="mt-1 text-xs text-muted-foreground capitalize">{r.kind} · {r.targetLang.toUpperCase()} · {new Date(r.createdAt).toLocaleDateString()}</p></div><StatusLabel status={r.status} /></li>)}</ul>}</section>
    <section className="border-t border-border pt-6"><h2 className="mb-4 text-lg font-medium">Continue in your studio</h2><div className="grid gap-2 sm:grid-cols-3">{[{ to: "/transcribe" as const, label: "Transcribe", icon: Mic }, { to: "/team" as const, label: "Workspaces", icon: Users }, { to: "/connectors" as const, label: "Connectors", icon: Plug }].map(({ to, label, icon: Icon }) => <Button key={to} asChild variant="outline" className="justify-between"><Link to={to}><span className="flex items-center gap-2"><Icon />{label}</span><ArrowUpRight /></Link></Button>)}</div></section>
  </div>;
}
