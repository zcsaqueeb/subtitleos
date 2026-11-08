// Server-only helper for admin-controlled feature locks.
// Reads app_settings.feature_locks = { [featureId]: { locked: boolean, message?: string } }
// Admins always bypass the lock.

export type FeatureId =
  | "voice_dubbing"
  | "voice_cloning"
  | "lipsync"
  | "ai_summaries"
  | "transcribe"
  | "batch_translate";

export const FEATURE_LABELS: Record<FeatureId, string> = {
  voice_dubbing: "Voice Dubbing",
  voice_cloning: "Voice Cloning",
  lipsync: "Built-in Lip-sync (Sync.so)",
  ai_summaries: "AI Summaries",
  transcribe: "Transcription",
  batch_translate: "Batch Translate (ZIP)",
};

export const FEATURE_IDS: FeatureId[] = [
  "voice_dubbing",
  "voice_cloning",
  "lipsync",
  "ai_summaries",
  "transcribe",
  "batch_translate",
];

type LockMap = Partial<Record<FeatureId, { locked?: boolean; message?: string }>>;

async function readLocks(supabase: any): Promise<LockMap> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "feature_locks")
    .maybeSingle();
  return ((data?.value ?? {}) as LockMap) || {};
}

export async function getFeatureLockState(
  supabase: any,
  featureId: FeatureId,
): Promise<{ locked: boolean; message: string }> {
  const map = await readLocks(supabase);
  const entry = map[featureId];
  return { locked: !!entry?.locked, message: entry?.message ?? "" };
}

/** Throws when the feature is locked by an admin. Admins always bypass. */
export async function assertFeatureUnlocked(
  supabase: any,
  userId: string,
  featureId: FeatureId,
): Promise<void> {
  // Admins always bypass feature locks.
  const { data: adminRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (adminRow) return;

  const state = await getFeatureLockState(supabase, featureId);
  if (state.locked) {
    const label = FEATURE_LABELS[featureId] ?? featureId;
    throw new Error(
      state.message?.trim()
        ? `${label} is temporarily disabled: ${state.message.trim()}`
        : `${label} is temporarily disabled by the administrator. Please try again later.`,
    );
  }
}
