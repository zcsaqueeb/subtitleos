import { AlertTriangle, AlertCircle, Info, X, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { TranslationErrorInfo } from "@/lib/translation-error";

interface Props {
  info: TranslationErrorInfo;
  onDismiss?: () => void;
  onAction?: () => void;
}

export function TranslationErrorBanner({ info, onDismiss, onAction }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const Icon = info.severity === "error" ? AlertCircle : info.severity === "warning" ? AlertTriangle : Info;
  const colour =
    info.severity === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : info.severity === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : "border-sky-500/40 bg-sky-500/10 text-sky-300";

  return (
    <div className={`relative rounded-xl border ${colour} px-4 py-3`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{info.title}</div>
          <div className="mt-1 text-xs text-foreground/80">{info.hint}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {info.action && (
              <button
                onClick={() => {
                  if (info.action?.href?.startsWith("/")) {
                    window.location.href = info.action.href;
                  } else {
                    onAction?.();
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md border border-current/40 px-2 py-1 hover:bg-current/10"
              >
                {info.action.label}
                {info.action.href?.startsWith("/") && <ExternalLink className="h-3 w-3" />}
              </button>
            )}
            <button
              onClick={() => setShowDetail((s) => !s)}
              className="text-foreground/60 underline-offset-2 hover:underline"
            >
              {showDetail ? "Hide" : "Show"} technical detail
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(info.raw).catch(() => {})}
              className="text-foreground/60 underline-offset-2 hover:underline"
            >
              Copy error
            </button>
          </div>
          {showDetail && (
            <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-background/60 p-2 text-[10px] text-foreground/70">
              {info.raw}
            </pre>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 rounded p-1 text-foreground/50 hover:bg-current/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
