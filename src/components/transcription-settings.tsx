import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { ProviderPanel, type ProviderPanelOption } from "@/components/provider-panel";
import {
  TRANSCRIPTION_PROVIDERS,
  TRANSCRIPTION_CATEGORY_LABEL,
  categorizedTranscription,
  getTranscriptionProvider,
  type TranscriptionProviderId,
} from "@/lib/transcription/registry";
import { getPlatformDefaults } from "@/lib/admin.functions";
import { encryptString, decryptString, isEncrypted } from "@/lib/secure-store";

export type TranscriptionConfig = {
  providerId: TranscriptionProviderId;
  apiKey?: string;
  url?: string;
  model?: string;
};

// Stored shape on disk: apiKey is replaced with apiKeyEnc (AES-GCM ciphertext).
type StoredConfig = Omit<TranscriptionConfig, "apiKey"> & { apiKeyEnc?: string; apiKey?: string };

const STORAGE_KEY = "subtitleos.transcription.v1";
const HAS_USER_OVERRIDE_KEY = "subtitleos.transcription.v1.userSet";

export async function loadTranscriptionConfig(): Promise<TranscriptionConfig> {
  if (typeof window === "undefined") return { providerId: "openai" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { providerId: "openai" };
    const parsed = JSON.parse(raw) as StoredConfig;
    if (!getTranscriptionProvider(parsed.providerId)) return { providerId: "openai" };
    let apiKey: string | undefined;
    if (parsed.apiKeyEnc) {
      try {
        apiKey = await decryptString(parsed.apiKeyEnc);
      } catch {
        apiKey = undefined; // key rotated / db cleared — force re-entry
      }
    } else if (parsed.apiKey) {
      // Legacy plaintext — migrate to encrypted on next save
      apiKey = parsed.apiKey;
    }
    return { providerId: parsed.providerId, url: parsed.url, model: parsed.model, apiKey };
  } catch {
    return { providerId: "openai" };
  }
}

async function saveTranscriptionConfig(cfg: TranscriptionConfig) {
  if (typeof window === "undefined") return;
  const stored: StoredConfig = { providerId: cfg.providerId, url: cfg.url, model: cfg.model };
  if (cfg.apiKey && cfg.apiKey.trim()) {
    try {
      stored.apiKeyEnc = await encryptString(cfg.apiKey.trim());
    } catch {
      // If encryption fails (very old browser), refuse to persist plaintext key.
      stored.apiKeyEnc = undefined;
    }
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  window.localStorage.setItem(HAS_USER_OVERRIDE_KEY, "1");
}

export function useTranscriptionConfig(): [TranscriptionConfig, (next: TranscriptionConfig) => void] {
  const [cfg, setCfg] = useState<TranscriptionConfig>({ providerId: "openai" });
  useEffect(() => {
    let cancelled = false;
    loadTranscriptionConfig().then((c) => {
      if (!cancelled) setCfg(c);
      // Migrate legacy plaintext to encrypted at rest.
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw && !isEncrypted(JSON.parse(raw)?.apiKeyEnc ?? "") && c.apiKey) {
          void saveTranscriptionConfig(c);
        }
      }
    });
    if (typeof window !== "undefined" && !window.localStorage.getItem(HAS_USER_OVERRIDE_KEY)) {
      getPlatformDefaults()
        .then((d) => {
          const id = d?.transcriptionProviderId as TranscriptionProviderId | undefined;
          if (id && getTranscriptionProvider(id) && !cancelled) setCfg({ providerId: id });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);
  function update(next: TranscriptionConfig) {
    setCfg(next);
    void saveTranscriptionConfig(next);
  }
  return [cfg, update];
}

export function validateTranscriptionConfig(cfg: TranscriptionConfig): string | null {
  const spec = getTranscriptionProvider(cfg.providerId);
  if (!spec) return "No transcription provider selected.";
  if (spec.requiresApiKey && !(cfg.apiKey && cfg.apiKey.trim())) {
    return `${spec.label} requires an API key. Add it in Transcription settings.`;
  }
  if (spec.acceptsCustomUrl && !((cfg.url && cfg.url.trim()) || spec.defaultUrl)) {
    return `${spec.label} requires an endpoint URL. Add it in Transcription settings.`;
  }
  return null;
}

const OPEN_EVENT = "subtitleos:open-transcription-settings";
export function openTranscriptionSettings() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function TranscriptionSettings({ config, onChange }: { config: TranscriptionConfig; onChange: (config: TranscriptionConfig) => void }) {
  const [open, setOpen] = useState(false);
  const spec = getTranscriptionProvider(config.providerId);
  useEffect(() => {
    const handle = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, handle);
    return () => window.removeEventListener(OPEN_EVENT, handle);
  }, []);
  const options: ProviderPanelOption[] = categorizedTranscription().flatMap(group => group.items.map(p => ({
    id: p.id, label: p.label, category: p.category,
    categoryLabel: p.category === 'machine-translation' ? 'Speech recognition' : p.category === 'llm' ? 'AI audio' : p.category === 'local' ? 'Local Providers' : 'Hosted Providers',
    implemented: p.implemented, requiresApiKey: p.requiresApiKey, acceptsCustomUrl: p.acceptsCustomUrl,
    description: p.description, apiKeyUrl: p.apiKeyUrl, models: p.models,
    defaults: { url: p.defaultUrl, model: p.defaultModel }, local: p.category === 'local' || p.id === 'litellm',
    timing: p.hasTimestamps ? 'Timestamp support varies by model' : 'Estimated subtitle timing',
    endpointLabel: p.id === 'azure-speech' ? 'Region' : p.id === 'aws-transcribe' ? 'Region | bucket' : p.id === 'cloudflare-workers-ai' ? 'Cloudflare account ID' : p.id === 'yandex-speechkit' ? 'Folder ID' : 'Endpoint URL',
  })));
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="outline" title="Transcription provider" className="h-auto min-h-11 max-w-full justify-start whitespace-normal text-left text-xs"><Mic className="text-primary" /><span className="text-muted-foreground">STT:</span><span>{spec?.label ?? config.providerId}</span></Button></SheetTrigger>
    {open && <ProviderPanel title="Transcription provider" options={options} config={config} onSave={next => { if (getTranscriptionProvider(next.providerId)) onChange({ ...next, providerId: next.providerId as TranscriptionProviderId }); }} onClose={() => setOpen(false)} />}
  </Sheet>;
}
