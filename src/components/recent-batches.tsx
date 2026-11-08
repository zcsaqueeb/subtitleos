import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Trash2, FileArchive, Clock } from "lucide-react";
import {
  listBatchJobs,
  getBatchZip,
  deleteBatchJob,
  clearBatchJobs,
  type BatchJobMeta,
} from "@/lib/batch-history";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatWhen(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export function RecentBatches() {
  const [jobs, setJobs] = useState<BatchJobMeta[]>([]);

  useEffect(() => {
    const refresh = () => setJobs(listBatchJobs());
    refresh();
    const onChange = () => refresh();
    window.addEventListener("batch-history-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("batch-history-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  async function handleDownload(job: BatchJobMeta) {
    try {
      const blob = await getBatchZip(job.id);
      if (!blob) {
        toast.error("Result expired — the ZIP is no longer cached.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `translations_${job.targetLang}_${new Date(job.createdAt)
        .toISOString()
        .replace(/[:.]/g, "-")}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Failed to load cached ZIP.");
    }
  }

  async function handleDelete(id: string) {
    await deleteBatchJob(id);
    setJobs(listBatchJobs());
    window.dispatchEvent(new CustomEvent("batch-history-changed"));
  }

  async function handleClear() {
    if (!confirm("Clear all cached batch results?")) return;
    await clearBatchJobs();
    setJobs([]);
    window.dispatchEvent(new CustomEvent("batch-history-changed"));
  }

  return (
    <section className="mt-10 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Recent batches</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cached on this device. Re-download the bundled ZIP from previous runs.
          </p>
        </div>
        {jobs.length > 0 && (
          <button
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear all
          </button>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-6 text-center text-sm text-muted-foreground">
          No batch runs yet. Translate an archive above and it'll appear here.
        </div>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-3"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold/10 text-gold">
                <FileArchive className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {job.fileCount} file{job.fileCount === 1 ? "" : "s"} → {job.targetLang}
                  </span>
                  <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {job.okCount} ok · {job.failedCount} failed
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatSize(job.zipSize)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatWhen(job.createdAt)}
                  <span className="truncate"> · {job.fileNames.slice(0, 3).join(", ")}
                    {job.fileNames.length > 3 ? ` +${job.fileNames.length - 3} more` : ""}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(job)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> ZIP
                </button>
                <button
                  onClick={() => handleDelete(job.id)}
                  aria-label="Delete cached result"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
