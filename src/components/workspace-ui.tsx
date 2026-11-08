import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
    <div className="min-w-0"><p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">{eyebrow}</p>
      <h1 className="font-display text-3xl sm:text-4xl">{title}</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p></div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>;
}

export function EmptyActivity({ filtered = false }: { filtered?: boolean }) {
  return <div className="flex flex-col items-center gap-3 py-14 text-center">
    <FileText className="h-8 w-8 text-muted-foreground" />
    <h3 className="font-medium">{filtered ? "No matching activity" : "Your next project starts here"}</h3>
    <p className="max-w-sm text-sm text-muted-foreground">{filtered ? "Try another filename, date or status." : "Saved subtitle batches and transcripts appear here, along with any available translation history."}</p>
    {!filtered && <Button asChild><Link to="/app">Translate subtitles <ArrowUpRight /></Link></Button>}
  </div>;
}

export function StatusLabel({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1.5 text-xs capitalize ${status === "failed" || status === "error" ? "text-destructive" : status === "completed" ? "text-primary" : "text-muted-foreground"}`}>
    <span className="size-1.5 shrink-0 rounded-full bg-current" />{status}
  </span>;
}