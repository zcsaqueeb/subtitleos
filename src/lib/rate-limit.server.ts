// Server-only rate limiting helper. Uses a Postgres-backed counter via the
// `check_rate_limit` RPC (SECURITY DEFINER, service-role only). Safe to call
// from server functions and server routes.

import { getRequestHeader } from "@tanstack/react-start/server";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

export class RateLimitError extends Error {
  resetAt: Date;
  constructor(message: string, resetAt: Date) {
    super(message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

export function getClientIp(): string {
  // x-forwarded-for may be a comma-separated list; first entry is the client.
  const xff = getRequestHeader("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = getRequestHeader("x-real-ip");
  if (real) return real.trim();
  const cf = getRequestHeader("cf-connecting-ip");
  if (cf) return cf.trim();
  return "unknown";
}

export async function checkRateLimit(
  bucket: string,
  identifier: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    _bucket: bucket,
    _identifier: identifier.toLowerCase().slice(0, 200),
    _max: max,
    _window_seconds: windowSeconds,
  });
  if (error) {
    // Fail open on infrastructure errors so we never lock real users out.
    console.error("[rate-limit] rpc error:", error.message);
    return { allowed: true, remaining: max, resetAt: new Date(Date.now() + windowSeconds * 1000) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { allowed: true, remaining: max, resetAt: new Date(Date.now() + windowSeconds * 1000) };
  }
  return {
    allowed: !!row.allowed,
    remaining: Number(row.remaining ?? 0),
    resetAt: new Date(row.reset_at),
  };
}

function formatRetry(resetAt: Date): string {
  const secs = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.ceil(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.ceil(mins / 60);
  return `${hrs} hour${hrs === 1 ? "" : "s"}`;
}

/**
 * Enforce one or more rate-limit buckets. Throws RateLimitError on first hit.
 * Pass IP-scoped and identity-scoped buckets together for layered defense.
 */
export async function enforceRateLimits(
  checks: Array<{ bucket: string; identifier: string; max: number; windowSeconds: number }>,
): Promise<void> {
  for (const c of checks) {
    const res = await checkRateLimit(c.bucket, c.identifier, c.max, c.windowSeconds);
    if (!res.allowed) {
      // Embed ISO timestamp so clients can render a live countdown + suggest actions.
      throw new RateLimitError(
        `Too many attempts. Please try again in ${formatRetry(res.resetAt)}. [retry:${res.resetAt.toISOString()}]`,
        res.resetAt,
      );
    }
  }
}
