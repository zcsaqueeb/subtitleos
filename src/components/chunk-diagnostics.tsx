import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";

export type ChunkAttempt = {
  /** 1-based attempt number. */
  attempt: number;
  at: number;
  ok: boolean;
  /** Raw provider/network error message for the failed attempt. */
  error?: string;
  /** Friendly retry reason: "provider rate limit", "network hiccup", "offline". */
  reason?: string;
  /** Backoff applied before the next attempt, in ms. */
  waitMs?: number;
  ms?: number;
};

export type ChunkDiagStatus = "queued" | "running" | "retrying" | "done" | "failed" | "skipped";

export type ChunkDiag = {
  index: number;
  startSec: number;
  endSec: number;
  bytes?: number;
  status: ChunkDiagStatus;
  providerId?: string;
  model?: string;
  attempts: ChunkAttempt[];
  error?: string;
  ms?: number;
  cues?: number;
};

function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function fmtMs(ms?: number) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const STATUS_STYLES: Record<ChunkDiagStatus, string> = {
  queued: "border-border bg-background text-muted-foreground",
  running: "border-gold/40 bg-gold/10 text-gold",
  retrying: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  skipped: "border-border bg-background text-muted-foreground",
};

function StatusIcon({ status }: { status: ChunkDiagStatus }) {
  if (status === "done") return <Check className="h-3 w-3" />;
  if (status === "failed") return <AlertTriangle className="h-3 w-3" />;
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin" />;
  if (status === "retrying") return <RotateCcw className="h-3 w-3" />;
  if (status === "skipped") return <SkipForward className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}

export function ChunkDiagnostics({
  chunks,
  onRetryChunk,
  busy,
}: {
  chunks: ChunkDiag[];
  onRetryChunk?: (index: number) => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<"all" | ChunkDiagStatus>("all");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const counts = useMemo(() => {
    const c: Record<string, number> = { done: 0, failed: 0, running: 0, retrying: 0, queued: 0, skipped: 0 };
    for (const ch of chunks) c[ch.status] = (c[ch.status] ?? 0) + 1;
    return c;
  }, [chunks]);

  const rows = useMemo(
    () => (filter === "all" ? chunks : chunks.filter((c) => c.status === filter)),
    [chunks, filter],
  );

  if (!chunks.length) return null;

  const copyReport = async () => {
    const report = chunks
      .map((c) => {
        const head = `#${c.index + 1} [${fmtClock(c.startSec)}–${fmtClock(c.endSec)}] ${c.status} · ${c.providerId ?? "?"}${c.model ? ` / ${c.model}` : ""} · ${fmtMs(c.ms)}`;
        const tries = c.attempts
          .map(
            (a) =>
              `   attempt ${a.attempt} ${a.ok ? "ok" : "failed"}${a.reason ? ` (${a.reason})` : ""}${a.waitMs ? ` → waited ${fmtMs(a.waitMs)}` : ""}${a.error ? `: ${a.error}` : ""}`,
          )
          .join("\n");
        return c.error ? `${head}\n   error: ${c.error}\n${tries}` : `${head}\n${tries}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Chunk diagnostics copied to clipboard");
    } catch {
      toast.error("Could not copy the report");
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Activity className="h-3.5 w-3.5 text-gold" />
          Chunk diagnostics ({chunks.length})
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-500">{counts.done} done</span>
          {counts.retrying > 0 && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-500">{counts.retrying} retrying</span>
          )}
          {counts.running > 0 && (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">{counts.running} running</span>
          )}
          {counts.failed > 0 && (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">{counts.failed} failed</span>
          )}
          {counts.queued > 0 && (
            <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{counts.queued} queued</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | ChunkDiagStatus)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-gold/60 focus:outline-none"
          >
            <option value="all">All chunks</option>
            <option value="failed">Failed</option>
            <option value="retrying">Retrying</option>
            <option value="running">Running</option>
            <option value="queued">Queued</option>
            <option value="done">Done</option>
          </select>
          <button
            type="button"
            onClick={copyReport}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-card"
          >
            <Copy className="h-3 w-3" /> Copy report
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card/95 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Range</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Provider / model</th>
                <th className="px-2 py-1.5">Tries</th>
                <th className="px-2 py-1.5">Time</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                    No chunks match this filter.
                  </td>
                </tr>
              )}
              {rows.map((c) => {
                const isOpen = !!expanded[c.index];
                return (
                  <tr key={c.index} className="border-t border-border/60 align-top">
                    <td className="px-2 py-1.5 text-muted-foreground">{c.index + 1}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                      {fmtClock(c.startSec)}–{fmtClock(c.endSec)}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLES[c.status]}`}>
                        <StatusIcon status={c.status} /> {c.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-foreground">{c.providerId ?? "—"}</span>
                      {c.model && <span className="text-muted-foreground"> / {c.model}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{c.attempts.length || "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{fmtMs(c.ms)}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {c.attempts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpanded((s) => ({ ...s, [c.index]: !isOpen }))}
                            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-card"
                          >
                            {isOpen ? "Hide" : "Log"}
                          </button>
                        )}
                        {onRetryChunk && c.status === "failed" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onRetryChunk(c.index)}
                            className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold hover:bg-gold/20 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" /> Retry
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <div className="mt-1.5 space-y-1 rounded-md border border-border bg-background/60 p-2 text-left">
                          {c.error && (
                            <div className="text-[11px] text-destructive break-words">Final error: {c.error}</div>
                          )}
                          {c.attempts.map((a) => (
                            <div key={a.attempt} className="text-[11px] text-muted-foreground break-words">
                              <span className={a.ok ? "text-emerald-500" : "text-amber-500"}>
                                attempt {a.attempt} · {a.ok ? "ok" : "failed"}
                              </span>
                              {a.reason ? ` · ${a.reason}` : ""}
                              {a.waitMs ? ` · backoff ${fmtMs(a.waitMs)}` : ""}
                              {a.ms ? ` · ${fmtMs(a.ms)}` : ""}
                              {a.error ? ` — ${a.error}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
