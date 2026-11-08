import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { validateEmailDetailed } from "@/lib/email-validation";
import { enforceRateLimits, getClientIp, RateLimitError } from "@/lib/rate-limit.server";

// Convert RateLimitError into a structured payload so server-fn callers can
// react without a thrown error bubbling into the global error overlay
// (which renders as a "blank screen" runtime error).
function rateLimitedPayload(err: unknown) {
  if (err instanceof RateLimitError) {
    return {
      rateLimited: true as const,
      message: err.message,
      retryAt: err.resetAt.toISOString(),
    };
  }
  return null;
}

const EmailInput = z.object({ email: z.string().min(1).max(254) });

const ActionInput = z.object({
  email: z.string().min(1).max(254),
  action: z.enum(["signin", "signup", "reset"]),
});

export const validateEmailServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => EmailInput.parse(input))
  .handler(async ({ data }) => {
    const ip = getClientIp();
    const emailKey = data.email.trim().toLowerCase();
    try {
      await enforceRateLimits([
        { bucket: "email_validate:ip", identifier: ip, max: 30, windowSeconds: 60 },
        { bucket: "email_validate:email", identifier: emailKey, max: 10, windowSeconds: 60 },
      ]);
    } catch (e) {
      const rl = rateLimitedPayload(e);
      if (rl) return rl;
      throw e;
    }
    const r = validateEmailDetailed(data.email);
    return { ok: r.ok, email: r.email, issues: r.issues, messages: r.messages };
  });

export const checkEmailExists = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => EmailInput.parse(input))
  .handler(async ({ data }) => {
    const ip = getClientIp();
    const emailKey = data.email.trim().toLowerCase();
    // Tight limits — this endpoint is the primary enumeration risk.
    try {
      await enforceRateLimits([
        { bucket: "email_check:ip", identifier: ip, max: 10, windowSeconds: 60 },
        { bucket: "email_check:email", identifier: emailKey, max: 5, windowSeconds: 60 },
        { bucket: "email_check:ip:hour", identifier: ip, max: 60, windowSeconds: 3600 },
      ]);
    } catch (e) {
      const rl = rateLimitedPayload(e);
      if (rl) return rl;
      throw e;
    }
    const v = validateEmailDetailed(data.email);
    if (!v.ok) {
      throw new Error(v.messages[0] ?? "Invalid email address");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", v.email)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { exists: !!profile };
  });

/**
 * Pre-flight rate-limit gate called before sign-in / sign-up / reset attempts.
 * Layered IP + email buckets defend against brute force and credential stuffing
 * without depending on Supabase Auth's internal throttling alone.
 */
export const authPrecheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ActionInput.parse(input))
  .handler(async ({ data }) => {
    const ip = getClientIp();
    const emailKey = data.email.trim().toLowerCase();
    try {
      if (data.action === "signin") {
        await enforceRateLimits([
          { bucket: "auth_signin:ip", identifier: ip, max: 20, windowSeconds: 2 * 60 },
          { bucket: "auth_signin:email", identifier: emailKey, max: 10, windowSeconds: 2 * 60 },
          { bucket: "auth_signin:ip:hour", identifier: ip, max: 100, windowSeconds: 10 * 60 },
        ]);
      } else if (data.action === "signup") {
        await enforceRateLimits([
          { bucket: "auth_signup:ip", identifier: ip, max: 15, windowSeconds: 10 * 60 },
          { bucket: "auth_signup:email", identifier: emailKey, max: 5, windowSeconds: 10 * 60 },
        ]);
      } else {
        await enforceRateLimits([
          { bucket: "auth_reset:ip", identifier: ip, max: 10, windowSeconds: 10 * 60 },
          { bucket: "auth_reset:email", identifier: emailKey, max: 5, windowSeconds: 10 * 60 },
        ]);
      }
    } catch (e) {
      const rl = rateLimitedPayload(e);
      if (rl) return rl;
      throw e;
    }
    return { ok: true as const };
  });
