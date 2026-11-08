import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";

const URL = "https://subtitleos.lovable.app/about";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About SubtitleOS — free subtitle studio for everyone" },
      {
        name: "description",
        content:
          "Why SubtitleOS exists: a free, open subtitle and dubbing studio so no story gets lost in translation.",
      },
      { property: "og:title", content: "About SubtitleOS — free subtitle studio for everyone" },
      {
        property: "og:description",
        content: "The mission behind SubtitleOS: free translation, transcription and dubbing for every storyteller.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: AboutPage,
});

const STATS = [
  ["100+", "languages"],
  ["8", "studio tools"],
  ["0", "sign-ups needed"],
  ["₹0", "forever"],
];

function AboutPage() {
  return (
    <MarketingPage
      eyebrow="About"
      title={<>Subtitles deserve <em className="text-gold-gradient italic">better</em>.</>}
      lede="SubtitleOS is a free studio for translating, transcribing, dubbing and burning subtitles — built so great stories reach every audience."
    >
      <div className="not-prose grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map(([n, l]) => (
          <div key={l} className="rounded-2xl border border-border bg-card/50 p-4 text-center">
            <div className="font-display text-3xl text-gold">{n}</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      <h2>Our story</h2>
      <p>
        Subtitle tools were expensive, slow, and locked behind sign-ups. Independent filmmakers,
        creators and fans were left copying lines one by one. We built SubtitleOS to fix that —
        one place where anyone can turn a video into a multilingual release.
      </p>

      <h2>What you can do</h2>
      <ul>
        <li><strong>Translate</strong> subtitle files with automatic language detection and free providers.</li>
        <li><strong>Transcribe</strong> video or audio into timed subtitles.</li>
        <li><strong>Dub</strong> movies with your own voice, matched to the lips.</li>
        <li><strong>Burn &amp; edit</strong> — style subtitles into video and trim, crop and export.</li>
      </ul>

      <h2>What we value</h2>
      <ul>
        <li><strong>Craft over scale.</strong> The right word beats the fast word.</li>
        <li><strong>Privacy by default.</strong> Editing and recording happen in your browser.</li>
        <li><strong>Free for everyone.</strong> Every feature, no paywalls, no dark patterns.</li>
        <li><strong>Works everywhere.</strong> Web, Android and Windows.</li>
      </ul>

      <h2>Get started</h2>
      <p>Open the <Link to="/app">translator</Link> or read the <Link to="/docs">docs</Link>.</p>
    </MarketingPage>
  );
}
