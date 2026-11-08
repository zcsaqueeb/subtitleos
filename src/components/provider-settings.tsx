import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { ProviderPanel, type ProviderPanelOption } from "@/components/provider-panel";
import { PROVIDERS, categorized, getProvider, CATEGORY_LABEL, type ProviderId } from "@/lib/translation/registry";
import { getPlatformDefaults } from "@/lib/admin.functions";

export type ProviderConfig = {
  providerId: ProviderId;
  apiKey?: string;
  url?: string;
  model?: string;
  region?: string;
  apiVersion?: string;
  folderId?: string;
};

const STORAGE_KEY = "subtitleos.provider.v1";
const HAS_USER_OVERRIDE_KEY = "subtitleos.provider.v1.userSet";

export function loadProviderConfig(): ProviderConfig {
  if (typeof window === "undefined") return { providerId: "gtxFreeAPI" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { providerId: "gtxFreeAPI" };
    const parsed = JSON.parse(raw) as ProviderConfig;
    if (!getProvider(parsed.providerId)) return { providerId: "gtxFreeAPI" };
    return parsed;
  } catch {
    return { providerId: "gtxFreeAPI" };
  }
}

function saveProviderConfig(cfg: ProviderConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  window.localStorage.setItem(HAS_USER_OVERRIDE_KEY, "1");
}

export function useProviderConfig(): [ProviderConfig, (next: ProviderConfig) => void] {
  const [cfg, setCfg] = useState<ProviderConfig>({ providerId: "gtxFreeAPI" });
  useEffect(() => {
    setCfg(loadProviderConfig());
    if (typeof window !== "undefined" && !window.localStorage.getItem(HAS_USER_OVERRIDE_KEY)) {
      getPlatformDefaults()
        .then((d) => {
          const id = d?.translationProviderId as ProviderId | undefined;
          if (id && getProvider(id)) setCfg({ providerId: id });
        })
        .catch(() => {});
    }
  }, []);
  function update(next: ProviderConfig) {
    setCfg(next);
    saveProviderConfig(next);
  }
  return [cfg, update];
}

export function ProviderSettings({ config, onChange }: { config: ProviderConfig; onChange: (config: ProviderConfig) => void }) {
  const [open, setOpen] = useState(false);
  const spec = getProvider(config.providerId);
  const options: ProviderPanelOption[] = categorized().flatMap(group => group.items.map(({ id, spec }) => ({
    id, label: spec.label, category: group.category, categoryLabel: CATEGORY_LABEL[group.category],
    implemented: spec.implemented, requiresApiKey: spec.requiresApiKey, acceptsCustomUrl: spec.acceptsCustomUrl,
    description: spec.description,
    apiKeyUrl: spec.apiKeyUrl, models: spec.models, endpoints: spec.endpoints, fields: spec.fields,
    local: group.category === 'local' || ['translategemma', 'litellm', 'llm', 'libretranslate'].includes(id),
    defaults: spec.kind === 'openai-compat' ? { url: spec.endpoint, model: spec.defaultModel } : { ...spec.defaults },
  })));
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="outline" className="h-auto min-h-11 max-w-full justify-start whitespace-normal text-left text-xs" title="Translation provider"><Settings2 className="text-primary" /><span className="text-muted-foreground">Provider:</span><span>{spec?.label ?? config.providerId}</span></Button></SheetTrigger>
    {open && <ProviderPanel title="Translation provider" options={options} config={config} onSave={next => { if (getProvider(next.providerId)) onChange({ ...next, providerId: next.providerId as ProviderId }); }} onClose={() => setOpen(false)} />}
  </Sheet>;
}

export { PROVIDERS };
