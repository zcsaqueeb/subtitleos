import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowRight, ArrowUpRight, Check, Clapperboard, Download, FileArchive, FileText, Languages, Menu, Mic, Monitor, Scissors, Smartphone, Sparkles, Subtitles, Users, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import logoUrl from '@/assets/logo.png';
import studioImage from '@/assets/home-studio.jpg';
import androidDownload from '@/assets/downloads/android.apk.asset.json';
import windowsDownload from '@/assets/downloads/windows.exe.asset.json';

const FAQ_ITEMS = [
  { q: 'Is SubtitleOS free to use?', a: 'Yes. The studio tools are free to open, without a subscription or payment. Local editing, subtitle burning and recording work in your browser. External AI services can have their own costs and limits.' },
  { q: 'Which tools need my own API key?', a: 'The translator has free translation engines. Speech transcription, AI voices and provider-generated lip-sync need a compatible provider key or configured endpoint. You can record your own movie dub without a voice-provider key.' },
  { q: 'Can I translate a whole ZIP archive?', a: 'Yes. Batch Translator accepts subtitle files and ZIP archives, supports multiple target languages and packages the results into ZIP downloads.' },
  { q: 'Can I record my own voice over a movie?', a: 'Yes. Movie Dubbing lets you record along with a video, choose and replay takes, adjust their timing and export the dubbed video. Recording does not alter the original actor’s mouth; generated lip-sync is a separate provider service.' },
  { q: 'Where are my files processed?', a: 'Video editing, subtitle burning and voice recording run in your browser. Translation, transcription and other AI steps send the content they need to the selected provider. Review that provider’s privacy terms before sending sensitive material.' },
  { q: 'Does it work on phones and computers?', a: 'Yes. Use SubtitleOS in a modern browser, the Android app or the Windows desktop app. Large video exports depend on your device’s available memory and processing power.' },
];

export const Route = createFileRoute('/')({
  validateSearch: z.object({ checkout: z.enum(['studio', 'enterprise']).optional(), method: z.enum(['crypto', 'wallet', 'upi']).optional(), signedOut: z.string().optional() }),
  head: () => ({
    meta: [
      { title: 'SubtitleOS — Subtitles, Video & Voice Studio' },
      { name: 'description', content: 'Translate subtitles, transcribe audio, edit video and record movie dubs with SubtitleOS. Free studio tools for your next story.' },
      { property: 'og:title', content: 'SubtitleOS — Subtitles, Video & Voice Studio' },
      { property: 'og:description', content: 'One studio for subtitle translation, video editing, transcription and voice dubbing. Start with your file.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://subtitleos.lovable.app/' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://subtitleos.lovable.app/' }],
    scripts: [{ type: 'application/ld+json', children: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_ITEMS.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }) }],
  }),
  component: Homepage,
});

const tools = [
  { name: 'Subtitle Translator', category: 'subtitles', to: '/app', icon: Languages, description: 'Translate your subtitle track, review every line and keep the timing.', detail: 'Free translation engines', tone: 'text-primary' },
  { name: 'Batch Translator', category: 'subtitles', to: '/batch', icon: FileArchive, description: 'Multiple files. Multiple languages. Organized ZIP downloads.', detail: 'Subtitles & ZIP archives', tone: 'text-home-mint' },
  { name: 'Transcribe Audio & Video', category: 'subtitles', to: '/transcribe', icon: Waves, description: 'Turn spoken dialogue into editable, downloadable subtitles.', detail: 'Your transcription provider', tone: 'text-home-coral' },
  { name: 'Burn Subtitles', category: 'video', to: '/burn', icon: Subtitles, description: 'Set the font, position and timing. Make your captions part of the video.', detail: 'Local video export', tone: 'text-primary' },
  { name: 'Video Editor', category: 'video', to: '/editor', icon: Scissors, description: 'Trim a clip, add text and overlays, then export your finished cut.', detail: 'Edit in your browser', tone: 'text-home-mint' },
  { name: 'Movie Dubbing', category: 'video', to: '/dub/movie', icon: Mic, description: 'Record your own voice, replay takes and bring the dub into your video.', detail: 'Your voice. Your performance.', tone: 'text-home-coral' },
  { name: 'Voice Dubbing', category: 'video', to: '/dub', icon: Clapperboard, description: 'Review a transcript, translate dialogue and generate a new voice track.', detail: 'Your voice provider', tone: 'text-primary' },
  { name: 'Multi-Character Studio', category: 'video', to: '/dub/projects', icon: Users, description: 'Organize dialogue by character and edit individual lines and voices.', detail: 'Saved projects need an account session', tone: 'text-home-mint' },
  { name: 'AI Video & Audio Summary', category: 'video', to: '/summarize', icon: Sparkles, description: 'Review your transcript and turn it into a clear, editable summary.', detail: 'Video, audio & transcript inputs', tone: 'text-home-coral' },
] as const;

const navigation = [{ label: 'Studio tools', href: '#tools' }, { label: 'Workflow', href: '#workflow' }, { label: 'Languages', href: '#languages' }, { label: 'Downloads', href: '#downloads' }, { label: 'FAQ', href: '#faq' }];
const samples = [
  { name: 'English', code: 'en', line: 'Every journey begins with a story.' },
  { name: 'Hindi', code: 'hi', line: 'हर सफ़र एक कहानी से शुरू होता है।' },
  { name: 'Urdu', code: 'ur', line: 'ہر سفر ایک کہانی سے شروع ہوتا ہے۔' },
];

function Homepage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sample, setSample] = useState(samples[0]);
  const [filter, setFilter] = useState<'all' | 'subtitles' | 'video'>('all');
  const [toolSearch, setToolSearch] = useState('');
  const visibleTools = tools.filter(tool => (filter === 'all' || tool.category === filter) && `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(toolSearch.trim().toLocaleLowerCase()));
  useEffect(() => {
    if (search.signedOut === '1') {
      toast.success('Session cleared everywhere.');
      navigate({ to: '/', replace: true });
    }
  }, [search.signedOut, navigate]);

  return (
    <div className="homepage min-h-screen bg-background text-foreground">
      <a href="#tools" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4">Skip to studio tools</a>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
          <Link to="/" aria-label="SubtitleOS home" className="flex shrink-0 items-center gap-2.5">
            <img src={logoUrl} width={32} height={32} alt="" className="size-8 rounded-md" />
            <span className="font-display text-2xl">SubtitleOS</span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">
            {navigation.map(item => <Button key={item.href} asChild variant="link" className="px-0 text-muted-foreground hover:text-foreground"><a href={item.href}>{item.label}</a></Button>)}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild className="h-11 px-4"><Link to="/app">Open studio <ArrowUpRight /></Link></Button>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="size-11 lg:hidden" aria-label="Open navigation menu"><Menu /></Button></SheetTrigger>
              <SheetContent side="right" className="w-[min(90%,360px)] overflow-y-auto data-[state=open]:animate-none data-[state=closed]:animate-none">
                <SheetTitle className="font-display text-3xl">SubtitleOS</SheetTitle>
                <SheetDescription className="sr-only">Homepage navigation</SheetDescription>
                <nav aria-label="Mobile navigation" className="mt-8 flex flex-col gap-2">
                  {navigation.map(item => <Button key={item.href} asChild variant="ghost" className="h-12 justify-start" onClick={() => setMenuOpen(false)}><a href={item.href}>{item.label}<ArrowRight className="ml-auto" /></a></Button>)}
                  <Button asChild variant="ghost" className="h-12 justify-start"><Link to="/docs">Docs <FileText className="ml-auto" /></Link></Button>
                  <div className="mt-3 border-t border-border pt-3">
                    {tools.map(tool => <Button key={tool.to} asChild variant="ghost" className="min-h-12 w-full justify-start whitespace-normal text-left" onClick={() => setMenuOpen(false)}><Link to={tool.to}><tool.icon />{tool.name}</Link></Button>)}
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main>
        <section className="home-film relative isolate overflow-hidden" aria-labelledby="home-title">
          <img src={studioImage} width={1920} height={1088} fetchPriority="high" alt="Two filmmakers looking across the water from a ferry" className="absolute inset-0 -z-20 h-full w-full object-cover object-[65%_center]" />
          <div className="home-film-shade absolute inset-0 -z-10" />
          <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-between px-5 py-9 sm:px-8 sm:py-6 lg:py-12">
            <div className="max-w-xl">
              <p className="mb-4 flex items-center gap-2 text-xs font-medium text-home-film-muted"><span className="size-1.5 rounded-full bg-home-mint" /> YOUR SUBTITLE, VIDEO & VOICE STUDIO</p>
              <h1 id="home-title" className="font-display text-6xl leading-none sm:text-7xl lg:text-8xl">SubtitleOS</h1>
              <p className="mt-3 font-display text-3xl leading-tight sm:text-4xl">Your story.<br /><em className="text-primary">In every language.</em></p>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-home-film-muted sm:text-base">Translate the words. Shape the video. Make it your voice. Everything for your next cut, in one place.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild className="h-12 px-5"><Link to="/app">Start translating <ArrowUpRight /></Link></Button>
                <Button asChild variant="outline" className="home-film-button h-12 px-5"><a href="#tools">Explore tools <ArrowRight /></a></Button>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-home-film-muted"><Check className="size-3.5 text-home-mint" /> Free studio tools. No subscription.</p>
            </div>
            <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-home-film-border pt-4 sm:flex-row sm:items-end">
              <div className="flex items-center gap-1" role="group" aria-label="Example subtitle language">
                {samples.map(item => <Button key={item.code} variant="ghost" size="sm" aria-pressed={sample.code === item.code} onClick={() => setSample(item)} className={`home-film-button h-10 px-3 ${sample.code === item.code ? 'home-language-active' : ''}`}>{item.name}</Button>)}
              </div>
              <div className="min-h-[52px] max-w-md sm:text-right" aria-live="polite">
                <p className="text-[10px] text-home-film-muted">SUBTITLE EXAMPLE</p>
                <p dir={sample.code === 'ur' ? 'rtl' : 'ltr'} className="mt-1 text-sm font-medium sm:text-base">{sample.line}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="tools" className="scroll-mt-6 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div><p className="text-xs font-medium text-primary">THE STUDIO</p><h2 className="mt-2 font-display text-4xl sm:text-5xl">What are you making today?</h2></div>
              <div role="group" aria-label="Filter studio tools" className="flex w-fit flex-wrap gap-1 border-b border-border pb-2">
                {([{ id: 'all', label: 'All tools', icon: Sparkles }, { id: 'subtitles', label: 'Subtitles', icon: Languages }, { id: 'video', label: 'Video & voice', icon: Clapperboard }] as const).map(item => <Button key={item.id} variant={filter === item.id ? 'secondary' : 'ghost'} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className="h-11 px-3"><item.icon />{item.label}</Button>)}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3"><Input aria-label="Search studio tools" placeholder="Search tools…" value={toolSearch} onChange={e => setToolSearch(e.target.value)} className="h-12 w-full sm:max-w-sm" /><span className="text-xs text-muted-foreground" role="status">{visibleTools.length} tools</span></div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTools.map(tool => (
                <Button key={tool.name} asChild variant="ghost" className="group h-auto items-stretch justify-start whitespace-normal rounded-lg border border-border bg-card p-6 text-left hover:border-primary/50 hover:bg-accent/40">
                  <Link to={tool.to} className="flex flex-col">
                    <div className="flex items-center justify-between"><tool.icon className={`size-6 ${tool.tone}`} /><ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
                    <h3 className="mt-5 text-lg font-semibold">{tool.name}</h3>
                    <p className="mt-2 min-h-12 text-sm font-normal leading-relaxed text-muted-foreground">{tool.description}</p>
                    <p className="mt-5 border-t border-border pt-3 text-xs font-normal text-muted-foreground">{tool.detail}</p>
                  </Link>
                </Button>
              ))}
            </div>
            {!visibleTools.length && <p className="py-8 text-sm text-muted-foreground">No matching tools.</p>}
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Studio access is free. AI transcription, generated voices and lip-sync use your selected provider; their charges and limits may apply.</p>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-6 border-y border-border bg-secondary/25 py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <p className="text-xs font-medium text-primary">FROM FIRST FILE TO FINAL CUT</p>
            <h2 className="mt-2 font-display text-4xl sm:text-5xl">Keep your story moving.</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { n: '01', title: 'Bring your source', text: 'Start with a subtitle track, a ZIP archive, a video or an audio recording.' },
                { n: '02', title: 'Choose your direction', text: 'Pick a target language, review a transcript or record your own performance.' },
                { n: '03', title: 'Make it yours', text: 'Review the words. Refine the captions. Adjust the timing and voice.' },
                { n: '04', title: 'Finish the cut', text: 'Download your subtitles, export your edit or save a dubbed video.' },
              ].map(step => <div key={step.n} className="border-t border-border pt-5"><span className="font-mono text-sm text-primary">{step.n}</span><h3 className="mt-4 text-lg font-medium">{step.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p></div>)}
            </div>
          </div>
        </section>

        <section id="languages" className="scroll-mt-6 py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-xl"><p className="text-xs font-medium text-primary">BEYOND ONE LANGUAGE</p><h2 className="mt-2 font-display text-4xl sm:text-5xl">Different words.<br /><em>The same story.</em></h2><p className="mt-4 text-sm leading-relaxed text-muted-foreground">Start with automatic source detection. Translate into the languages your audience speaks, then review the result in your own words.</p></div>
            <div className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { name: 'Indian languages', values: ['Hindi', 'Hinglish', 'Urdu', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Punjabi'] },
                { name: 'East & Southeast Asia', values: ['Chinese', 'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Indonesian'] },
                { name: 'Europe & beyond', values: ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese'] },
                { name: 'Middle East & Africa', values: ['Arabic', 'Persian', 'Hebrew', 'Swahili'] },
              ].map(group => <div key={group.name} className="border-t border-border pt-4"><h3 className="text-sm font-medium text-primary">{group.name}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{group.values.join(' · ')}</p></div>)}
            </div>
            <Button asChild variant="link" className="mt-5 h-11 px-0"><Link to="/app">Choose your language <ArrowRight /></Link></Button>
          </div>
        </section>

        <section id="downloads" aria-labelledby="downloads-title" className="scroll-mt-6 border-t border-border bg-secondary/25 py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <p className="text-xs font-medium text-primary">SUBTITLEOS APPS</p>
            <h2 id="downloads-title" className="mt-2 font-display text-4xl sm:text-5xl">On your phone. On your desktop.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">These existing installers open the website. They are not fully native, all-offline apps; online AI tools still need a connection.</p>
            <div className="mt-9 grid gap-8 md:grid-cols-2">
              <div className="min-w-0 border-t border-border pt-5">
                <h3 className="flex items-center gap-3 text-xl font-medium"><Smartphone className="size-6 text-home-mint" />Android</h3>
                <p className="mt-3 text-sm text-muted-foreground">Version 1.6 · APK · {Math.ceil(androidDownload.size / 1024)} KB</p>
                <Button asChild className="mt-5 min-h-12 w-full sm:w-auto"><a href={androidDownload.url} download={androidDownload.original_filename}><Download />Download Android APK</a></Button>
                <p className="mt-4 max-w-lg text-xs leading-relaxed text-muted-foreground">Android may ask you to allow installation from this browser and offer a Play Protect scan. This update uses the same signing identity as the previous app.</p>
              </div>
              <div className="min-w-0 border-t border-border pt-5">
                <h3 className="flex items-center gap-3 text-xl font-medium"><Monitor className="size-6 text-home-coral" />Windows desktop</h3>
                <p className="mt-3 text-sm text-muted-foreground">Version 1.7 · EXE setup · {Math.ceil(windowsDownload.size / 1024 / 1024)} MB</p>
                <Button asChild variant="outline" className="mt-5 min-h-12 w-full sm:w-auto"><a href={windowsDownload.url} download={windowsDownload.original_filename}><Download />Download Windows installer</a></Button>
                <p className="mt-4 max-w-lg text-xs leading-relaxed text-muted-foreground">Windows installer with desktop and Start menu shortcuts. The installer is not code-signed, so Windows may show a security warning.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-6 border-t border-border py-14 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
            <div><p className="text-xs font-medium text-primary">GOOD TO KNOW</p><h2 className="mt-2 font-display text-4xl sm:text-5xl">A few answers.<br />Then, create.</h2><Button asChild variant="link" className="mt-5 h-11 px-0"><Link to="/docs">Read the docs <ArrowUpRight /></Link></Button></div>
            <Accordion type="single" collapsible defaultValue="faq-0">
              {FAQ_ITEMS.map((item, i) => <AccordionItem key={item.q} value={`faq-${i}`}><AccordionTrigger className="min-h-14 gap-4 py-5 text-base hover:no-underline">{item.q}</AccordionTrigger><AccordionContent className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent></AccordionItem>)}
            </Accordion>
          </div>
        </section>
        <section className="border-t border-border bg-secondary/30 py-12">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-5 sm:flex-row sm:items-center sm:px-8"><h2 className="font-display text-4xl">Your next story starts here.</h2><Button asChild className="h-12 w-fit px-6"><Link to="/app">Open SubtitleOS <ArrowUpRight /></Link></Button></div>
        </section>
      </main>
      <footer className="border-t border-border py-9">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-5 sm:px-8 md:flex-row">
          <div><Link to="/" className="flex items-center gap-2"><img src={logoUrl} width={28} height={28} alt="" className="size-7 rounded-md" /><span className="font-display text-2xl">SubtitleOS</span></Link><p className="mt-4 text-xs text-muted-foreground">© {new Date().getFullYear()} SubtitleOS. All rights reserved.</p></div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-1">
            <Button asChild variant="link" className="h-11 px-0 text-muted-foreground"><Link to="/about">About</Link></Button>
            <Button asChild variant="link" className="h-11 px-0 text-muted-foreground"><Link to="/docs">Docs</Link></Button>
            <Button asChild variant="link" className="h-11 px-0 text-muted-foreground"><Link to="/connectors">Connectors</Link></Button>
            <Button asChild variant="link" className="h-11 px-0 text-muted-foreground"><a href="#downloads">Downloads</a></Button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
