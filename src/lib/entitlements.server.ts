/**
 * Entitlements — everything in the app is FREE.
 *
 * All plan/limit/provider gating has been removed: every user (including
 * guests) gets unlimited access to every feature. These helpers stay in place
 * so existing call sites keep working.
 */
import { FREE_LANG_CODES } from "@/lib/free-languages";

export const FREE_MONTHLY_LIMIT = Number.POSITIVE_INFINITY;
export const FREE_DAILY_LIMIT = Number.POSITIVE_INFINITY;

export { FREE_LANG_CODES };

export class EntitlementError extends Error {
  status: number;
  code: "limit_reached" | "language_locked";
  constructor(code: "limit_reached" | "language_locked", message: string) {
    super(message);
    this.code = code;
    this.status = 402;
  }
}

type AnyClient = {
  from: (table: string) => any;
};

/** No-op: translations are unlimited for everyone. */
export async function assertCanTranslate(_args: {
  supabase: AnyClient;
  userId: string;
  targetLang: string;
}): Promise<void> {
  void _args;
}

/** Everyone has full (Studio-equivalent) entitlements. */
export async function getEntitlements(args: {
  supabase: AnyClient;
  userId: string;
}): Promise<{ isAdmin: boolean; plan: string; unlimited: boolean; hasStudio: boolean }> {
  let isAdmin = false;
  try {
    const { data } = await args.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", args.userId)
      .eq("role", "admin")
      .maybeSingle();
    isAdmin = !!data;
  } catch {
    isAdmin = false;
  }
  return { isAdmin, plan: "enterprise", unlimited: true, hasStudio: true };
}

/** No-op: all Studio features are free. */
export async function assertStudio(_args: { supabase: AnyClient; userId: string }): Promise<void> {
  void _args;
}

/** No-op: all translation providers are free. */
export async function assertProviderAllowed(_args: {
  supabase: AnyClient;
  userId: string;
  providerId: string;
}): Promise<void> {
  void _args;
}
