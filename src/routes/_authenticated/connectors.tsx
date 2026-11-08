import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, ExternalLink, KeyRound, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/workspace-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDubServices } from "@/lib/dub.functions";
import { getUserElevenLabsKey, setUserElevenLabsKey, getUserSyncSoKey, setUserSyncSoKey } from "@/lib/user-connectors";

export const Route = createFileRoute("/_authenticated/connectors")({
  head: () => ({
    meta: [
      { title: "Your Connectors — SubtitleOS" },
      { name: "description", content: "Set up your own ElevenLabs and Sync.so keys for dubbing and lip-sync in SubtitleOS." },
      { property: "og:title", content: "Your Connectors — SubtitleOS" },
      { property: "og:description", content: "Set up your own ElevenLabs and Sync.so keys for dubbing and lip-sync in SubtitleOS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectorsPage,
});

function ConnectorsPage() {
  const fetchServices = useServerFn(getDubServices);
  const { data: services } = useQuery({ queryKey: ["dub-services"], queryFn: () => fetchServices(), staleTime: 30_000 });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeading eyebrow="Personal settings" title="Connectors" description="Your own service keys for voice cloning and video lip-sync." />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5"><p className="text-sm text-muted-foreground">Personal to this browser · No admin setup</p><Button variant="outline" asChild><Link to="/dub/movie">Open movie dubbing</Link></Button></div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
        <PersonalKeyCard
          name="ElevenLabs"
          description="Voices and voice cloning"
          keyUrl="https://elevenlabs.io/app/settings/api-keys"
          getKey={getUserElevenLabsKey}
          setKey={setUserElevenLabsKey}
          sharedAvailable={!!services?.hasElevenLabs}
        />
        <PersonalKeyCard
          name="Sync.so"
          description="Lip-sync your dubbed video"
          keyUrl="https://sync.so/"
          getKey={getUserSyncSoKey}
          setKey={setUserSyncSoKey}
          sharedAvailable={!!services?.hasSyncSo}
        />
        </div>
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">Keys are saved only in this browser. On a shared device, remove them when finished. Your key is sent to SubtitleOS when you use its service.</p>
      </div>
    </AppShell>
  );
}

function PersonalKeyCard({ name, description, keyUrl, getKey, setKey, sharedAvailable }: {
  name: string;
  description: string;
  keyUrl: string;
  getKey: () => string | undefined;
  setKey: (value: string | null) => void;
  sharedAvailable: boolean;
}) {
  const [value, setValue] = useState("");
  const [savedValue, setSavedValue] = useState("");
  const saved = !!savedValue;
  const dirty = value.trim() !== savedValue;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = getKey();
    setValue(key ?? "");
    setSavedValue(key ?? "");
  }, [getKey]);

  function save() {
    if (!value.trim()) { toast.error(`Enter your ${name} API key first.`); return; }
    setKey(value.trim());
    if (getKey() !== value.trim()) { toast.error("This browser could not save your key."); return; }
    setSavedValue(value.trim());
    setValue(value.trim());
    setVisible(false);
    toast.success(`${name} key saved for this browser.`);
  }

  function remove() {
    setKey(null);
    setValue("");
    if (getKey()) { toast.error("This browser could not remove your key."); return; }
    setSavedValue("");
    setVisible(false);
    toast.success(`${name} key removed from this browser.`);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-lg">{name}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {saved && <CheckCircle2 className="h-4 w-4 text-primary" />}
          {dirty ? "Unsaved changes" : saved ? "Saved in this browser" : sharedAvailable ? "Shared access available" : "Not configured"}
        </span>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <label htmlFor={`connector-${name}`} className="text-sm font-medium">Your {name} API key</label>
        <a href={keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Get a key <ExternalLink className="h-3 w-3" /></a>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          id={`connector-${name}`}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste your key"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="button" variant="outline" size="icon" onClick={() => setVisible((current) => !current)} aria-label={visible ? `Hide ${name} key` : `Show ${name} key`} title={visible ? "Hide key" : "Show key"}>
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={!value.trim() || !dirty} onClick={save}><Save /> {saved ? "Update key" : "Save key"}</Button>
        {dirty && <Button type="button" variant="ghost" onClick={() => { setValue(savedValue); setVisible(false); }}>Discard changes</Button>}
        {saved && <Button type="button" variant="outline" onClick={remove}><Trash2 /> Remove key</Button>}
      </div>
      {sharedAvailable && <p className="mt-3 text-xs text-muted-foreground">Your key takes priority over shared access.</p>}
    </section>
  );
}