// Standalone-mode Supabase accessor.
//
// The app can run with NO backend configured (no Supabase project, no keys).
// In that case we hand out a local stub client so every call site keeps
// working in "guest" mode instead of throwing at import/first-use time.
import { supabase as realSupabase } from "@/integrations/supabase/client";

export const supabaseConfigured: boolean = Boolean(
  (import.meta.env?.VITE_SUPABASE_URL as string | undefined) &&
    (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined),
);

const offline = () => ({ data: null, error: { message: "Backend not configured (standalone mode)" } });

function makeStub() {
  const subscription = { unsubscribe() {} };
  const auth = {
    async getSession() {
      return { data: { session: null }, error: null };
    },
    async getUser() {
      return { data: { user: null }, error: null };
    },
    onAuthStateChange(_cb: unknown) {
      return { data: { subscription } };
    },
    async signOut() {
      return { error: null };
    },
    async signInWithOtp() {
      return offline();
    },
    async signInWithPassword() {
      return offline();
    },
    async signInWithOAuth() {
      return offline();
    },
    async verifyOtp() {
      return offline();
    },
    async updateUser() {
      return offline();
    },
    async resetPasswordForEmail() {
      return offline();
    },
    async setSession() {
      return offline();
    },
  };

  const table = {
    select: () => table,
    insert: async () => offline(),
    update: async () => offline(),
    upsert: async () => offline(),
    delete: async () => offline(),
    eq: () => table,
    order: () => table,
    limit: () => table,
    maybeSingle: async () => offline(),
    single: async () => offline(),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  };

  const bucket = {
    async upload() {
      return offline();
    },
    async remove() {
      return offline();
    },
    async download() {
      return offline();
    },
    async createSignedUrl() {
      return offline();
    },
    getPublicUrl: () => ({ data: { publicUrl: "" } }),
  };

  return {
    auth,
    from: () => table,
    storage: { from: () => bucket },
    functions: { invoke: async () => offline() },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  };
}

let stub: ReturnType<typeof makeStub> | undefined;

/**
 * Drop-in replacement for the generated client.
 * Falls back to a local no-op client when the backend is not configured.
 */
export const supabase = new Proxy({} as typeof realSupabase, {
  get(_t, prop, receiver) {
    if (supabaseConfigured) {
      try {
        return Reflect.get(realSupabase, prop, receiver);
      } catch {
        /* fall through to stub */
      }
    }
    if (!stub) stub = makeStub();
    return Reflect.get(stub as unknown as object, prop, receiver);
  },
});
