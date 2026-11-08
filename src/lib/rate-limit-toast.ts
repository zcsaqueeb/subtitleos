import { toast } from "sonner";

const RETRY_RE = /\[retry:([^\]]+)\]/;

function parseRetryAt(message: string): Date | null {
  const m = RETRY_RE.exec(message);
  if (!m) return null;
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatRemaining(resetAt: Date): { label: string; seconds: number } {
  const seconds = Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  if (seconds < 60) return { label: `${seconds}s`, seconds };
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (mins < 60) return { label: rem ? `${mins}m ${rem}s` : `${mins}m`, seconds };
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return { label: remMins ? `${hrs}h ${remMins}m` : `${hrs}h`, seconds };
}

export function isRateLimitMessage(message: string): boolean {
  return RETRY_RE.test(message) || /too many attempts/i.test(message);
}

/**
 * Show a live-countdown toast for rate-limit errors with the best next action.
 * Returns true if the error was a rate-limit error (and a toast was shown).
 */
export function showRateLimitToast(err: unknown, context?: "signin" | "signup" | "reset" | "validate"): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (!isRateLimitMessage(message)) return false;

  const resetAt = parseRetryAt(message) ?? new Date(Date.now() + 60_000);
  const baseMsg = message.replace(RETRY_RE, "").trim();

  const suggestion =
    context === "signin"
      ? "If you've forgotten your password, use the reset link instead of retrying."
      : context === "signup"
      ? "Already have an account? Sign in instead, or contact support if this looks wrong."
      : context === "reset"
      ? "Reset links are still valid for 60 minutes — check your inbox before requesting another."
      : "Wait for the timer, then try again. Reach out to support if this keeps happening.";

  const id = `rate-limit-${context ?? "global"}`;
  const initial = formatRemaining(resetAt);

  toast.error(`Slow down — try again in ${initial.label}`, {
    id,
    description: `${baseMsg.replace(/^too many attempts\.\s*/i, "")} ${suggestion}`.trim(),
    duration: Math.min(initial.seconds * 1000 + 1500, 30_000),
  });

  // Live countdown: refresh the toast every second until the window resets.
  const tick = window.setInterval(() => {
    const next = formatRemaining(resetAt);
    if (next.seconds <= 0) {
      window.clearInterval(tick);
      toast.success("You can try again now.", { id });
      return;
    }
    toast.error(`Slow down — try again in ${next.label}`, {
      id,
      description: `${baseMsg.replace(/^too many attempts\.\s*/i, "")} ${suggestion}`.trim(),
      duration: Math.min(next.seconds * 1000 + 1500, 30_000),
    });
  }, 1000);

  // Safety stop after 10 minutes regardless.
  window.setTimeout(() => window.clearInterval(tick), 10 * 60_000);

  return true;
}
