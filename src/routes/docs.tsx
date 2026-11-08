import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";

const URL = "https://subtitleos.lovable.app/docs";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs — SubtitleOS guides for every tool" },
      {
        name: "description",
        content:
          "Step-by-step guides for translating, transcribing, dubbing, burning and editing subtitles with SubtitleOS — free, no sign-in.",
      },
      { property: "og:title", content: "Docs — SubtitleOS guides for every tool" },
      {
        property: "og:description",
        content: "Guides for translation, transcription, movie dubbing, burn-in and the video editor.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: DocsPage,
});

const TOC = [
  ["quick-start", "Quick start"],
  ["translate", "Translate"],
  ["batch", "Batch & ZIP"],
  ["transcribe", "Transcribe"],
  ["dubbing", "Movie dubbing"],
  ["burn", "Burn subtitles"],
  ["editor", "Video editor"],
  ["keys", "Your own keys"],
  ["formats", "Formats"],
  ["faq", "FAQ"],
] as const;

function DocsPage() {
  return (
    <MarketingPage
      eyebrow="Docs"
      title={<>Everything you need, <em className="text-gold-gradient italic">in one place</em>.</>}
      lede="Short, practical guides for every SubtitleOS tool. Everything is free and works without an account."
    >
      <nav aria-label="On this page" className="not-prose rounded-2xl border border-border bg-card/50 p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">On this page</p>
        <div className="flex flex-wrap gap-2">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1.5 text-sm !text-foreground !no-underline hover:bg-accent">
              {label}
            </a>
          ))}
        </div>
      </nav>

      <h2 id="quick-start">Quick start</h2>
      <ul>
        <li>Open the <Link to="/app">translator</Link> — no sign-in needed.</li>
        <li>Drop in a subtitle file or paste cues.</li>
        <li>Leave source on <strong>Auto</strong>, pick a target language, press <strong>Translate</strong>.</li>
        <li>Download in the same format — timing stays frame-accurate.</li>
      </ul>

      <h2 id="translate">Translate</h2>
      <p>Choose a provider: <strong>GTX (Free)</strong> is the default, with Edge and DeepLX as automatic fallbacks if one fails. Presets save your favourite language pairs and options. Scene-aware mode keeps names and tone consistent, and translation memory reuses lines you've already fixed.</p>
      <p>Optional polishing cleans up line length, reading speed and punctuation after translating.</p>

      <h2 id="batch">Batch & ZIP</h2>
      <p>In <Link to="/batch">Batch</Link>, add many files or ZIP archives at once and translate them into several languages. Results download as one ZIP per language.</p>

      <h2 id="transcribe">Transcribe</h2>
      <p><Link to="/transcribe">Transcribe</Link> turns a video or audio file into timed subtitles. It needs your own AI key or a self-hosted endpoint, added in the page settings.</p>

      <h2 id="dubbing">Movie dubbing</h2>
      <ul>
        <li>Open <Link to="/dub/movie">Movie Dubbing</Link> and pick a video.</li>
        <li>Pause where you want to start, hit record, and speak along. Add effects, noise reduction and live monitoring (use headphones).</li>
        <li>Each take starts and stops on the exact frames you recorded.</li>
        <li>Turn on <strong>Match the lips</strong> to align your voice to mouth movement, then export.</li>
      </ul>

      <h2 id="burn">Burn subtitles</h2>
      <p><Link to="/burn">Burn</Link> writes subtitles permanently into the video. Upload a font, pick a style and track, adjust timing offset, and export — all in your browser, so short clips work best on phones.</p>

      <h2 id="editor">Video editor</h2>
      <p>The <Link to="/editor">editor</Link> trims frame-by-frame, crops to 16:9, 9:16, 1:1 and more, adds text and overlays, and exports MP4, WebM or GIF. Undo and redo with Ctrl+Z / Ctrl+Y.</p>

      <h2 id="keys">Your own keys</h2>
      <p>Add ElevenLabs (voice cloning) or Sync.so (lip-sync) keys in <Link to="/connectors">Connectors</Link>. Keys stay in your browser only and are sent just with your own requests.</p>

      <h2 id="formats">Supported formats</h2>
      <ul>
        <li><code>.srt</code>, <code>.vtt</code>, <code>.sbv</code> — timing preserved.</li>
        <li><code>.ass</code> / <code>.ssa</code> — styling preserved.</li>
        <li><code>.txt</code> — one cue per line.</li>
        <li><code>.zip</code> archives in Batch.</li>
      </ul>

      <h2 id="faq">FAQ</h2>
      <h3>Is it really free?</h3>
      <p>Yes — every feature, no limits, no account.</p>
      <h3>Where are my files stored?</h3>
      <p>Video editing, burn-in and recording run in your browser. Text is only sent to the translation provider you choose.</p>
      <h3>Is there an app?</h3>
      <p>Yes — Android and Windows versions, or add the website to your home screen.</p>
    </MarketingPage>
  );
}
