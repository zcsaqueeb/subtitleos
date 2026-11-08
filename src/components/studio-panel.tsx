import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, BookOpen, Zap, Film, Plus, Trash2, Save, X } from "lucide-react";
import { listGlossaries, upsertGlossary, deleteGlossary } from "@/lib/glossary.functions";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

export type StudioSettings = {
  glossaryId: string | null;
  priority: boolean;
  frameAccurate: boolean;
  fps: number;
};

const DEFAULT_STUDIO: StudioSettings = {
  glossaryId: null,
  priority: false,
  frameAccurate: false,
  fps: 23.976,
};

const STORAGE_KEY = "subtitleos.studio.v1";

export function useStudioSettings(): [StudioSettings, (s: StudioSettings) => void] {
  const [state, setState] = useState<StudioSettings>(DEFAULT_STUDIO);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...DEFAULT_STUDIO, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  const update = (s: StudioSettings) => {
    setState(s);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  };
  return [state, update];
}

export function StudioPanel({
  settings,
  onChange,
}: {
  settings: StudioSettings;
  onChange: (s: StudioSettings) => void;
}) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const listFn = useServerFn(listGlossaries);
  const listQuery = useQuery({
    queryKey: ["glossaries"],
    queryFn: () => listFn(),
  });
  const items = listQuery.data?.items ?? [];

  return (
    <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/5 to-transparent p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-gold" /> Translation options
        </div>
        <span className="text-[11px] text-muted-foreground">Unlimited · 100+ languages</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {/* Priority engine */}
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card/40 p-2.5 hover:border-gold/40">
          <input
            type="checkbox"
            checked={settings.priority}
            onChange={(e) => onChange({ ...settings, priority: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-gold"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-xs font-medium"><Zap className="h-3.5 w-3.5 text-gold" /> Priority engine</div>
            <div className="text-[11px] text-muted-foreground">Routes through the highest-quality model (Gemini 2.5 Pro)</div>
          </div>
        </label>

        {/* Frame-accurate sync */}
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card/40 p-2.5 hover:border-gold/40">
          <input
            type="checkbox"
            checked={settings.frameAccurate}
            onChange={(e) => onChange({ ...settings, frameAccurate: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-gold"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-xs font-medium"><Film className="h-3.5 w-3.5 text-gold" /> Frame-accurate sync</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              FPS
              <select
                value={settings.fps}
                onChange={(e) => onChange({ ...settings, fps: parseFloat(e.target.value) })}
                disabled={!settings.frameAccurate}
                className="rounded border border-border bg-background px-1 py-0.5 text-[11px] disabled:opacity-50"
              >
                <option value={23.976}>23.976</option>
                <option value={24}>24</option>
                <option value={25}>25</option>
                <option value={29.97}>29.97</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={59.94}>59.94</option>
                <option value={60}>60</option>
              </select>
            </div>
          </div>
        </label>

        {/* Glossary */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card/40 p-2.5">
          <div className="flex items-center gap-1 text-xs font-medium"><BookOpen className="h-3.5 w-3.5 text-gold" /> Glossary</div>
          <select
            value={settings.glossaryId ?? ""}
            onChange={(e) => onChange({ ...settings, glossaryId: e.target.value || null })}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">None</option>
            {items.map((g: any) => (
              <option key={g.id} value={g.id}>{g.name} ({g.entries?.length ?? 0})</option>
            ))}
          </select>
          <Drawer open={glossaryOpen} onOpenChange={setGlossaryOpen}>
            <DrawerTrigger asChild>
              <button className="text-[11px] text-gold hover:underline text-left">Manage glossaries →</button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh]">
              <DrawerHeader>
                <DrawerTitle>Custom glossaries</DrawerTitle>
              </DrawerHeader>
              <GlossariesEditor onClose={() => setGlossaryOpen(false)} />
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </div>
  );
}

type Entry = { term: string; translation: string; caseSensitive?: boolean };

function GlossariesEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listGlossaries);
  const upsertFn = useServerFn(upsertGlossary);
  const deleteFn = useServerFn(deleteGlossary);
  const query = useQuery({ queryKey: ["glossaries"], queryFn: () => listFn() });
  const items = (query.data?.items ?? []) as Array<{ id: string; name: string; entries: Entry[]; source_lang: string | null; target_lang: string | null }>;

  const [editing, setEditing] = useState<{ id?: string; name: string; entries: Entry[] } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await upsertFn({ data: { id: editing.id, name: editing.name, entries: editing.entries.filter((e) => e.term && e.translation) } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["glossaries"] });
      toast.success("Glossary saved");
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["glossaries"] });
      toast.success("Glossary deleted");
    },
  });

  if (editing) {
    return (
      <div className="overflow-auto p-4 space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Glossary name (e.g. Brand Terms)"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</button>
          <button
            onClick={() => save.mutate()}
            disabled={!editing.name.trim() || save.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </div>
        <div className="space-y-1.5">
          {editing.entries.map((entry, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center">
              <input
                value={entry.term}
                onChange={(e) => {
                  const next = [...editing.entries];
                  next[i] = { ...entry, term: e.target.value };
                  setEditing({ ...editing, entries: next });
                }}
                placeholder="Source term"
                className="rounded border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                value={entry.translation}
                onChange={(e) => {
                  const next = [...editing.entries];
                  next[i] = { ...entry, translation: e.target.value };
                  setEditing({ ...editing, entries: next });
                }}
                placeholder="Translation"
                className="rounded border border-border bg-background px-2 py-1.5 text-xs"
              />
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!entry.caseSensitive}
                  onChange={(e) => {
                    const next = [...editing.entries];
                    next[i] = { ...entry, caseSensitive: e.target.checked };
                    setEditing({ ...editing, entries: next });
                  }}
                /> Aa
              </label>
              <button
                onClick={() => setEditing({ ...editing, entries: editing.entries.filter((_, j) => j !== i) })}
                className="rounded border border-border p-1.5 hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setEditing({ ...editing, entries: [...editing.entries, { term: "", translation: "" }] })}
            className="mt-2 inline-flex items-center gap-1 rounded border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Add term
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Terms in a glossary are enforced as exact replacements after the AI translates each cue.</p>
        <button
          onClick={() => setEditing({ name: "New glossary", entries: [{ term: "", translation: "" }] })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New glossary
        </button>
      </div>
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No glossaries yet. Create one to lock brand names, character names, or domain terms.
        </div>
      )}
      {items.map((g) => (
        <div key={g.id} className="flex items-center justify-between rounded-lg border border-border bg-card/40 p-3">
          <div>
            <div className="text-sm font-medium">{g.name}</div>
            <div className="text-[11px] text-muted-foreground">{g.entries?.length ?? 0} terms</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEditing({ id: g.id, name: g.name, entries: g.entries ?? [] })}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
            >Edit</button>
            <button
              onClick={() => { if (confirm(`Delete "${g.name}"?`)) del.mutate(g.id); }}
              className="rounded border border-destructive/30 p-1.5 hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          </div>
        </div>
      ))}
      <div className="pt-2 text-right">
        <button onClick={onClose} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" /> Close
        </button>
      </div>
    </div>
  );
}

/** Snap an SRT timestamp ("HH:MM:SS,mmm") to the nearest frame for the given FPS. */
export function frameAlignSrt(srt: string, fps: number): string {
  if (!fps || fps <= 0) return srt;
  const frameMs = 1000 / fps;
  const snap = (ms: number) => Math.round(ms / frameMs) * frameMs;
  const toMs = (h: string, m: string, s: string, ms: string) =>
    parseInt(h, 10) * 3600_000 + parseInt(m, 10) * 60_000 + parseInt(s, 10) * 1000 + parseInt(ms, 10);
  const fromMs = (t: number) => {
    const total = Math.max(0, Math.round(t));
    const h = Math.floor(total / 3600_000);
    const m = Math.floor((total % 3600_000) / 60_000);
    const s = Math.floor((total % 60_000) / 1000);
    const ms = total % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };
  return srt.replace(
    /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/g,
    (_m, h1, m1, s1, ms1, h2, m2, s2, ms2) =>
      `${fromMs(snap(toMs(h1, m1, s1, ms1)))} --> ${fromMs(snap(toMs(h2, m2, s2, ms2)))}`,
  );
}
