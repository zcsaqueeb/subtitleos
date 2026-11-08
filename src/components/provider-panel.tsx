import { useId, useMemo, useRef, useState } from 'react';
import { Check, ExternalLink, Eye, EyeOff, Search, Server, KeyRound, Settings2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

export type ProviderPanelConfig = { providerId: string; apiKey?: string; url?: string; model?: string; region?: string; apiVersion?: string; folderId?: string };
export type ProviderPanelOption = {
  id: string; label: string; category: string; categoryLabel: string; implemented: boolean;
  requiresApiKey: boolean; acceptsCustomUrl?: boolean; description?: string;
  apiKeyUrl?: string; defaults: Omit<ProviderPanelConfig, 'providerId'>;
  models?: ReadonlyArray<{ label: string; value: string }>;
  endpoints?: ReadonlyArray<{ label: string; url: string }>;
  fields?: ReadonlyArray<'region' | 'apiVersion' | 'folderId'>;
  endpointLabel?: string; local?: boolean; timing?: string;
};

export function ProviderPanel({ title, options, config, onSave, onClose }: {
  title: string; options: ProviderPanelOption[]; config: ProviderPanelConfig;
  onSave: (config: ProviderPanelConfig) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(config);
  const drafts = useRef<Record<string, ProviderPanelConfig>>({ [config.providerId]: config });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [keyless, setKeyless] = useState(false);
  const selected = options.find(p => p.id === draft.providerId);
  const categories = Array.from(new Map(options.map(p => [p.category, p.categoryLabel])).entries());
  const filtered = useMemo(() => options.filter(p =>
    (category === 'all' || p.category === category) && (!keyless || !p.requiresApiKey) &&
    `${p.label} ${p.categoryLabel} ${p.id} ${p.defaults.model ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [options, query, category, keyless]);
  const dirty = JSON.stringify(config) !== JSON.stringify(draft);
  function select(p: ProviderPanelOption) {
    if (!p.implemented) return;
    drafts.current[draft.providerId] = draft;
    setDraft(drafts.current[p.id] ?? { providerId: p.id, ...p.defaults });
  }
  function update(field: keyof ProviderPanelConfig, value: string) { setDraft(prev => ({ ...prev, [field]: value })); }
  const needsKey = selected?.requiresApiKey && !draft.apiKey?.trim();
  return (
    <SheetContent className="flex h-dvh w-full max-w-full flex-col gap-0 p-0 sm:max-w-3xl" aria-describedby="provider-description">
      <div className="shrink-0 border-b border-border px-5 py-5 pr-16">
        <SheetTitle className="font-display text-2xl">{title}</SheetTitle>
        <SheetDescription id="provider-description" className="mt-1 text-xs">{selected?.label} · {dirty ? 'Unsaved changes' : 'Current settings'}</SheetDescription>
      </div>
      <div className="shrink-0 space-y-3 border-b border-border px-5 py-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search providers" placeholder="Search providers or models…" value={query} onChange={e => setQuery(e.target.value)} className="h-11 pl-9" /></div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Provider categories">
          <Button size="sm" variant={category === 'all' ? 'secondary' : 'ghost'} aria-pressed={category === 'all'} onClick={() => setCategory('all')} className="min-h-10">All</Button>
          {categories.map(([id, label]) => <Button key={id} size="sm" variant={category === id ? 'secondary' : 'ghost'} aria-pressed={category === id} onClick={() => setCategory(id)} className="min-h-10">{label}</Button>)}
        </div>
        <label className="flex min-h-8 w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={keyless} onChange={e => setKeyless(e.target.checked)} className="size-4 accent-primary" /> No required API key</label>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(130px,32%)_1fr] overflow-hidden md:grid-cols-[270px_1fr] md:grid-rows-1">
        <div className="overflow-y-auto border-b border-border bg-muted/25 p-3 md:border-b-0 md:border-r" aria-label="Available providers">
          {filtered.length === 0 && <div className="p-3 text-sm text-muted-foreground"><p>No matching providers.</p><Button variant="link" className="px-0" onClick={() => { setQuery(''); setCategory('all'); setKeyless(false); }}>Clear filters</Button></div>}
          {categories.map(([id, label]) => {
            const items = filtered.filter(p => p.category === id);
            if (!items.length) return null;
            return <div key={id} className="mb-4"><h3 className="px-2 py-2 text-xs font-medium text-muted-foreground">{label} <span className="ml-1 font-mono">{items.length}</span></h3><div className="space-y-1">{items.map(p => <Button key={p.id} variant="ghost" disabled={!p.implemented} aria-pressed={draft.providerId === p.id} onClick={() => select(p)} className={`h-auto min-h-12 w-full justify-start whitespace-normal px-3 py-2 text-left ${draft.providerId === p.id ? 'bg-accent' : ''}`}><span className="min-w-0 flex-1"><span className="block text-sm">{p.label}</span><span className="block text-[11px] font-normal text-muted-foreground">{!p.implemented ? 'Unavailable' : p.local ? 'Self-hosted' : p.requiresApiKey ? 'Your API key' : 'No required key'}</span></span>{draft.providerId === p.id && <Check className="text-primary" />}</Button>)}</div></div>;
          })}
        </div>
        <div className="min-w-0 overflow-y-auto p-5">
          {selected && <div className="space-y-5">
            <div><div className="flex items-center gap-2"><Settings2 className="size-4 text-primary" /><h3 className="text-lg font-semibold">{selected.label}</h3></div>{selected.description && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{selected.description}</p>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5">{selected.local ? <Server className="size-3.5" /> : <KeyRound className="size-3.5" />}{selected.local ? 'Self-hosted endpoint' : selected.requiresApiKey ? 'Personal API key' : 'Keyless provider'}</span>{selected.timing && <span>{selected.timing}</span>}</div>
              {selected.apiKeyUrl && <Button asChild variant="link" className="mt-1 h-10 px-0 text-xs"><a href={selected.apiKeyUrl} target="_blank" rel="noreferrer">Provider key settings <ExternalLink /></a></Button>}
            </div>
            {(selected.requiresApiKey || selected.acceptsCustomUrl) && <ProviderField label={selected.requiresApiKey ? 'API key' : 'API key (optional)'} value={draft.apiKey ?? ''} password onChange={v => update('apiKey', v)} />}
            {selected.acceptsCustomUrl && <ProviderField label={selected.endpointLabel ?? 'Endpoint URL'} value={draft.url ?? ''} placeholder={selected.defaults.url} onChange={v => update('url', v)} />}
            {selected.endpoints && <div className="flex flex-wrap gap-2" role="group" aria-label="Endpoint presets">{selected.endpoints.map(e => <Button key={e.url} size="sm" variant={draft.url === e.url ? 'secondary' : 'outline'} aria-pressed={draft.url === e.url} onClick={() => update('url', e.url)} className="min-h-10">{e.label}</Button>)}</div>}
            {(selected.defaults.model || selected.models?.length) && <div className="space-y-2"><ProviderField label="Model" value={draft.model ?? ''} placeholder={selected.defaults.model} onChange={v => update('model', v)} />{selected.models && <div className="flex flex-wrap gap-2" role="group" aria-label="Model presets">{selected.models.map(m => <Button key={m.value} size="sm" variant={draft.model === m.value ? 'secondary' : 'outline'} aria-pressed={draft.model === m.value} onClick={() => update('model', m.value)} className="h-auto min-h-10 max-w-full whitespace-normal break-all">{m.label}</Button>)}</div>}</div>}
            {selected.fields?.map(field => <ProviderField key={field} label={field === 'apiVersion' ? 'API version' : field === 'folderId' ? 'Folder ID' : 'Region'} value={draft[field] ?? ''} onChange={v => update(field, v)} />)}
            {needsKey && <p className="border-l-2 border-primary pl-3 text-xs text-muted-foreground">API key missing. You can save this choice now and add the key before processing.</p>}
            {selected.local && <p className="border-l-2 border-primary pl-3 text-xs leading-relaxed text-muted-foreground">A local endpoint must be reachable by the app’s request service. On the hosted website, localhost does not point to your computer.</p>}
            <p className="text-xs leading-relaxed text-muted-foreground">Saved on this browser only, not synced across devices. Credentials are sent with your processing requests. Provider charges and limits may apply.</p>
            <Button variant="ghost" size="sm" onClick={() => setDraft(config)} disabled={!dirty} className="h-10 px-0"><RotateCcw /> Discard changes</Button>
          </div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <span className="text-xs text-muted-foreground">{dirty ? 'Unsaved changes' : 'No changes'}</span>
        <div className="flex gap-2"><Button variant="outline" onClick={onClose} className="h-11">Cancel</Button><Button onClick={() => { onSave(draft); onClose(); }} disabled={!selected?.implemented} className="h-11"><Check /> Save settings</Button></div>
      </div>
    </SheetContent>
  );
}

function ProviderField({ label, value, onChange, placeholder, password = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; password?: boolean }) {
  const id = useId(); const [visible, setVisible] = useState(false);
  return <div><label htmlFor={id} className="mb-2 block text-xs font-medium">{label}</label><div className="flex gap-2"><Input id={id} value={value} onChange={e => onChange(e.target.value)} type={password && !visible ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={placeholder} className="h-11 min-w-0" />{password && <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label={visible ? 'Hide API key' : 'Show API key'} title={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff /> : <Eye />}</Button>}</div></div>;
}