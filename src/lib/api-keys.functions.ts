import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function genKey() {
  // sos_live_<48 hex>
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sos_live_${hex}`;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const listApiKeys = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return [];
    const { supabase, userId } = auth;
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, usage_count, last_used_at, revoked, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ name: z.string().trim().min(1).max(60) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = genKey();
    const key_hash = await sha256(key);
    const key_prefix = `${key.slice(0, 16)}…${key.slice(-4)}`;
    const { error } = await supabase.from("api_keys").insert({
      user_id: userId,
      name: data.name,
      key_prefix,
      key_hash,
    });
    if (error) throw new Error(error.message);
    return { key }; // shown ONCE to the user
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("api_keys").update({ revoked: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("api_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
