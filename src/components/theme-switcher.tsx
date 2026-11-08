import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Check, Palette, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase-safe';
import { getMyTheme, updateMyTheme } from '@/lib/user.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { customThemeTokens, validHex, type CustomTheme } from '@/lib/theme-colors';

const THEMES = [
  { id: 'default', label: 'Signature Gold', group: 'Dark' },
  { id: 'noir-gold', label: 'Noir & Gold', group: 'Dark' },
  { id: 'midnight-indigo', label: 'Midnight Indigo', group: 'Dark' },
  { id: 'ocean-deep', label: 'Ocean Deep', group: 'Dark' },
  { id: 'emerald-prestige', label: 'Emerald Prestige', group: 'Dark' },
  { id: 'forest-moss', label: 'Forest Moss', group: 'Dark' },
  { id: 'autumn-harvest', label: 'Autumn Harvest', group: 'Dark' },
  { id: 'sunset-blaze', label: 'Sunset Blaze', group: 'Vivid' },
  { id: 'rose-quartz', label: 'Rose Quartz', group: 'Vivid' },
  { id: 'cyber-violet', label: 'Cyber Violet', group: 'Vivid' },
  { id: 'neon-mint', label: 'Neon Mint', group: 'Vivid' },
  { id: 'vapor-chrome', label: 'Vapor Chrome', group: 'Vivid' },
  { id: 'arctic-frost', label: 'Arctic Frost', group: 'Light' },
  { id: 'paper-ink', label: 'Paper & Ink', group: 'Light' },
] as const;
type ThemeId = typeof THEMES[number]['id'] | 'custom';
const STORAGE_KEY = 'subtitleos.theme';
const CUSTOM_KEY = 'subtitleos.theme.custom';
const DEFAULT_CUSTOM: CustomTheme = { background: '#0d0d0d', primary: '#d4a84c', accent: '#f0d78c' };
function validTheme(id: string): id is ThemeId { return id === 'custom' || THEMES.some(t => t.id === id); }
function loadTheme(): ThemeId {
  try { const id = localStorage.getItem(STORAGE_KEY); return id && validTheme(id) ? id : 'default'; } catch { return 'default'; }
}
function loadCustom(): CustomTheme {
  try { const data = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '{}'); const next = { ...DEFAULT_CUSTOM, ...data }; return Object.values(next).every(v => typeof v === 'string' && validHex(v)) ? next : DEFAULT_CUSTOM; } catch { return DEFAULT_CUSTOM; }
}
function applyTheme(id: ThemeId, custom = loadCustom()) {
  const root = document.documentElement;
  Object.keys(customThemeTokens(DEFAULT_CUSTOM)).forEach(key => root.style.removeProperty(key));
  if (id === 'default') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', id);
  if (id === 'custom') Object.entries(customThemeTokens(custom)).forEach(([key, value]) => root.style.setProperty(key, value));
  const bg = getComputedStyle(root).getPropertyValue('--background').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

export function ThemeBootstrap() {
  const fetchTheme = useServerFn(getMyTheme);
  useEffect(() => {
    let active = true;
    applyTheme(loadTheme());
    // A browser choice takes precedence; remote defaults must not overwrite it.
    supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session || localStorage.getItem(STORAGE_KEY)) return;
      fetchTheme().then(res => {
        if (!active || localStorage.getItem(STORAGE_KEY)) return;
        if (res?.theme && validTheme(res.theme)) {
          localStorage.setItem(STORAGE_KEY, res.theme); applyTheme(res.theme);
        }
      }).catch(() => {});
    });
    function sync(event: StorageEvent) { if (event.key === STORAGE_KEY || event.key === CUSTOM_KEY) applyTheme(loadTheme()); }
    window.addEventListener('storage', sync);
    return () => { active = false; window.removeEventListener('storage', sync); };
  }, [fetchTheme]);
  return null;
}

export function ThemeSwitcher() {
  const saveTheme = useServerFn(updateMyTheme);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ThemeId>('default');
  const [custom, setCustom] = useState(DEFAULT_CUSTOM);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const committed = useRef<ThemeId>('default');
  const savedCustom = useRef(DEFAULT_CUSTOM);
  function changeOpen(next: boolean) {
    if (next) { committed.current = loadTheme(); savedCustom.current = loadCustom(); setDraft(committed.current); setCustom(savedCustom.current); setQuery(''); setGroup('All'); }
    else applyTheme(committed.current, savedCustom.current);
    setOpen(next);
  }
  function select(id: ThemeId) { setDraft(id); applyTheme(id, custom); }
  const customValid = Object.values(custom).every(validHex);
  function commit() {
    if (draft === 'custom' && !customValid) return;
    try {
      if (draft === 'custom') localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
      localStorage.setItem(STORAGE_KEY, draft);
    } catch { /* theme still applies for this session */ }
    committed.current = draft; savedCustom.current = custom; applyTheme(draft, custom); setOpen(false);
    supabase.auth.getSession().then(({ data }) => { if (data.session) saveTheme({ data: { theme: draft } }).catch(() => {}); });
  }
  return <Sheet open={open} onOpenChange={changeOpen}>
    <SheetTrigger asChild><Button variant="outline" aria-label="Change theme" title="Change theme" className="h-11 gap-2 px-3"><Palette /><span className="hidden md:inline">Theme</span></Button></SheetTrigger>
    {open && <SheetContent className="flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-xl">
      <div className="border-b border-border p-5 pr-16"><SheetTitle className="font-display text-3xl">Make the studio yours.</SheetTitle><SheetDescription className="mt-2 text-xs">{draft === 'custom' ? 'Custom colors' : THEMES.find(t => t.id === draft)?.label} · Theme preview</SheetDescription></div>
      <div className="space-y-3 border-b border-border p-4"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search themes" placeholder="Search themes…" value={query} onChange={e => setQuery(e.target.value)} className="h-11 pl-9" /></div><div role="group" aria-label="Theme categories" className="flex gap-1">{['All', 'Dark', 'Light', 'Vivid'].map(item => <Button key={item} variant={group === item ? 'secondary' : 'ghost'} aria-pressed={group === item} className="h-11" onClick={() => setGroup(item)}>{item}</Button>)}</div></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {THEMES.filter(t => (group === 'All' || t.group === group) && t.label.toLowerCase().includes(query.toLowerCase())).map(theme => <Button key={theme.id} variant="ghost" aria-pressed={draft === theme.id} aria-label={theme.label} onClick={() => select(theme.id)} className={`h-auto flex-col items-stretch whitespace-normal rounded-lg border p-2 text-left ${draft === theme.id ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
            <div data-theme={theme.id} className="theme-miniature relative h-24 overflow-hidden rounded-md border border-border bg-background p-3" aria-hidden="true"><div className="flex gap-1"><span className="size-1.5 rounded-full bg-primary" /><span className="size-1.5 rounded-full bg-muted" /></div><div className="mt-3 flex gap-2"><div className="w-6 space-y-1"><span className="block h-1 rounded bg-muted" /><span className="block h-1 rounded bg-primary" /><span className="block h-1 rounded bg-muted" /></div><div className="flex-1"><div className="h-5 rounded border border-border bg-card" /><div className="mt-2 h-1.5 w-3/4 rounded bg-muted" /><div className="mt-2 h-3 w-10 rounded bg-primary" /></div></div></div>
            <span className="flex min-h-10 items-center justify-between gap-1 px-1 text-xs"><span>{theme.label}</span>{draft === theme.id && <Check className="shrink-0 text-primary" />}</span>
          </Button>)}
        </div>
        {THEMES.filter(t => (group === 'All' || t.group === group) && t.label.toLowerCase().includes(query.toLowerCase())).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No matching themes.</p>}
        <div className="mt-5 border-t border-border pt-4"><Button variant={draft === 'custom' ? 'secondary' : 'ghost'} className="h-12 w-full justify-start" aria-pressed={draft === 'custom'} onClick={() => select('custom')}><SlidersHorizontal /> Custom colors {draft === 'custom' && <Check className="ml-auto" />}</Button>
          {draft === 'custom' && <div className="mt-4 space-y-4">{([['background', 'Background'], ['primary', 'Primary'], ['accent', 'Highlight']] as const).map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3"><label htmlFor={`theme-${key}`} className="text-sm">{label}</label><div className="flex gap-2"><input aria-label={`${label} color`} type="color" value={validHex(custom[key]) ? custom[key] : DEFAULT_CUSTOM[key]} onChange={e => { const next = { ...custom, [key]: e.target.value }; setCustom(next); applyTheme('custom', next); }} className="size-11 cursor-pointer rounded-md border border-border bg-background p-1" /><Input id={`theme-${key}`} value={custom[key]} onChange={e => { const next = { ...custom, [key]: e.target.value }; setCustom(next); if (Object.values(next).every(validHex)) applyTheme('custom', next); }} className="h-11 w-28 font-mono text-xs" /></div></div>)}{!customValid && <p role="alert" className="text-xs text-destructive">Enter full six-digit colors, such as #123456.</p>}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><Button variant="ghost" onClick={() => { setCustom(DEFAULT_CUSTOM); select('default'); }} className="h-11 px-2" title="Reset to Signature Gold"><RotateCcw /><span className="text-xs">Reset</span></Button><div className="flex gap-2"><Button variant="outline" onClick={() => changeOpen(false)} className="h-11">Cancel</Button><Button onClick={commit} disabled={draft === 'custom' && !customValid} className="h-11"><Check />Apply theme</Button></div></div>
    </SheetContent>}
  </Sheet>;
}
