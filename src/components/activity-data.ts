import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyTranslations } from "@/lib/translate.functions";
import { listBatchJobs, getBatchZip, deleteBatchJob } from "@/lib/batch-history";
import { listHistory, deleteEntry } from "@/lib/transcript-history";

export type Activity = {
  id: string; name: string; kind: "translation" | "batch" | "transcript";
  status: string; sourceLang: string; targetLang: string; createdAt: number;
  count: number; chars: number; error?: string; text?: string;
};

export function useActivity() {
  const list = useServerFn(listMyTranslations);
  const cloud = useQuery({ queryKey: ["history"], queryFn: () => list(), retry: false });
  const [local, setLocal] = useState<Activity[]>([]);
  const [localError, setLocalError] = useState(false);
  function refreshLocal() {
    try {
      const batches: Activity[] = listBatchJobs().map(b => ({
        id: b.id, name: b.fileNames?.[0] ? `${b.fileNames[0]}${b.fileCount > 1 ? ` + ${b.fileCount - 1} more` : ""}` : "Subtitle batch",
        kind: "batch", status: b.failedCount ? "failed" : "completed", sourceLang: b.sourceLang,
        targetLang: b.targetLang, createdAt: b.createdAt, count: b.fileCount, chars: 0,
        error: b.failedCount ? `${b.failedCount} files failed; ${b.okCount} completed` : undefined,
      }));
      const transcripts: Activity[] = listHistory().map(t => ({
        id: t.id, name: t.sourceFileName || t.name, kind: "transcript",
        status: t.status === "complete" ? "completed" : t.status === "error" ? "failed" : t.status,
        sourceLang: t.sourceLang || "auto", targetLang: t.targetLang || t.sourceLang || "—",
        createdAt: t.createdAt, count: 1, chars: t.srt?.length || 0, error: t.error, text: t.srt,
      }));
      setLocal([...batches, ...transcripts]); setLocalError(false);
    } catch { setLocalError(true); }
  }
  useEffect(() => {
    refreshLocal();
    window.addEventListener("storage", refreshLocal);
    window.addEventListener("batch-history-changed", refreshLocal);
    window.addEventListener("focus", refreshLocal);
    return () => {
      window.removeEventListener("storage", refreshLocal);
      window.removeEventListener("batch-history-changed", refreshLocal);
      window.removeEventListener("focus", refreshLocal);
    };
  }, []);
  const translations: Activity[] = (cloud.data ?? []).map(r => ({
    id: r.id, name: r.file_name, kind: "translation", status: r.status,
    sourceLang: r.source_lang, targetLang: r.target_lang, createdAt: new Date(r.created_at).getTime(),
    count: 1, chars: r.char_count ?? 0, error: r.error_message || undefined,
  }));
  return {
    rows: [...translations, ...local].sort((a, b) => b.createdAt - a.createdAt),
    error: cloud.isError || localError,
    refresh: () => { refreshLocal(); void cloud.refetch(); },
  };
}

export async function localActivityOutput(row: Activity): Promise<Blob | null> {
  if (row.kind === "batch") return getBatchZip(row.id);
  return row.text ? new Blob([row.text], { type: "text/plain;charset=utf-8" }) : null;
}
export async function removeLocalActivity(row: Activity) {
  if (row.kind === "batch") await deleteBatchJob(row.id);
  else deleteEntry(row.id);
}

export function downloadActivity(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}