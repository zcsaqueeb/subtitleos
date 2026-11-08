import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase-safe";
import { AVATAR_PRESETS, isPresetAvatar } from "@/lib/avatar-presets";
import { updateMyProfile, signAvatarUrl } from "@/lib/user.functions";

export function useAvatarUrl(rawUrl: string | null | undefined) {
  const [resolved, setResolved] = useState<string | null>(null);
  const sign = useServerFn(signAvatarUrl);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!rawUrl) {
        setResolved(null);
        return;
      }
      if (rawUrl.startsWith("storage://avatars/")) {
        const path = rawUrl.replace("storage://avatars/", "");
        try {
          const { url } = await sign({ data: { path } });
          if (!cancelled) setResolved(url);
        } catch {
          if (!cancelled) setResolved(null);
        }
        return;
      }
      setResolved(rawUrl); // data: URI or http(s)
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [rawUrl, sign]);
  return resolved;
}

export function AvatarPicker({
  userId,
  currentUrl,
  onChange,
}: {
  userId: string;
  currentUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);
  const [uploading, setUploading] = useState(false);
  const resolved = useAvatarUrl(currentUrl);

  async function setUrl(url: string | null) {
    try {
      await updateFn({ data: { avatar_url: url } });
      onChange(url);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(url ? "Avatar updated" : "Avatar cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update avatar");
    }
  }

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    if (file.size > 2 * 1024 * 1024) return toast.error("Max 2 MB.");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw new Error(error.message);
      await setUrl(`storage://avatars/${path}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-border bg-gradient-to-br from-gold to-[oklch(0.6_0.18_60)] text-xl font-semibold text-ink">
          {resolved ? (
            <img src={resolved} alt="avatar" className="h-full w-full object-cover" />
          ) : (
            <span>?</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
          </label>
          {currentUrl && (
            <button
              onClick={() => setUrl(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <Trash2 className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Presets</div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {AVATAR_PRESETS.map((p) => {
            const active = isPresetAvatar(currentUrl) && currentUrl === p.url;
            return (
              <button
                key={p.id}
                onClick={() => setUrl(p.url)}
                className={`relative aspect-square overflow-hidden rounded-full border-2 transition ${
                  active ? "border-gold" : "border-border hover:border-gold/50"
                }`}
                aria-label={`Use ${p.id} avatar`}
              >
                <img src={p.url} alt={p.id} className="h-full w-full object-cover" />
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Check className="h-5 w-5 text-gold" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
