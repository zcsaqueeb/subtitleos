import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Subtitles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseTimedCaptions, srtTimestamp } from '@/lib/media-tools';

export function TranslationReview({ source, output, language }: { source: string; output: string; language: string }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(0);
  const sourceCues = useMemo(() => parseTimedCaptions(source), [source]);
  const outputCues = useMemo(() => parseTimedCaptions(output), [output]);
  const matches = outputCues.map((cue, index) => ({ cue, index })).filter(({ cue, index }) =>
    `${cue.text} ${sourceCues[index]?.text ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const position = Math.min(selected, Math.max(0, matches.length - 1));
  const current = matches[position];
  return <div className="flex h-full min-h-0 flex-col gap-4">
    <div className="relative">
      <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
      <input aria-label="Search translated cues" value={search} onChange={e => { setSearch(e.target.value); setSelected(0); }} placeholder="Search dialogue…" className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
    </div>
    {current ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Cue {current.index + 1} · {position + 1} of {matches.length}</span>
        <span className="font-mono">{srtTimestamp(current.cue.start)} → {srtTimestamp(current.cue.end)}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto border-y border-border py-5">
        <div><p className="mb-2 text-xs font-medium text-muted-foreground">Source</p><p className="whitespace-pre-wrap break-words text-sm leading-7">{sourceCues[current.index]?.text ?? '—'}</p></div>
        <div><p className="mb-2 text-xs font-medium text-primary">Translation · {language.toUpperCase()}</p><p dir={['ur', 'ar', 'he', 'fa'].includes(language) ? 'rtl' : 'ltr'} className="whitespace-pre-wrap break-words text-lg leading-8">{current.cue.text}</p></div>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" aria-label="Previous cue" title="Previous cue" disabled={position === 0} onClick={() => setSelected(position - 1)}><ChevronLeft /></Button>
        <select aria-label="Select review cue" value={position} onChange={e => setSelected(Number(e.target.value))} className="max-w-[180px] rounded-md border border-input bg-background p-2 text-sm">{matches.map(({ index }, i) => <option key={index} value={i}>Cue {index + 1}</option>)}</select>
        <Button variant="outline" size="icon" aria-label="Next cue" title="Next cue" disabled={position >= matches.length - 1} onClick={() => setSelected(position + 1)}><ChevronRight /></Button>
      </div>
    </> : <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Subtitles className="size-8" />{outputCues.length ? 'No matching dialogue' : 'No timed cues in this text'}</div>}
  </div>;
}