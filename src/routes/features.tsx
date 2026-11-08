import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Features \u2014 SubtitleOS" },
      { property: "og:description", content: "Context-aware AI, frame-perfect timing, 100+ languages, every format, private by default." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "Features — SubtitleOS" },
      { name: "description", content: "Context-aware AI, frame-perfect timing, 100+ languages, every format, private by default." },
    ],
  }),
  component: () => (
    <MarketingPage
      eyebrow="Features"
      title={<>Built for the people who <em className="text-gold-gradient italic">care</em>.</>}
      lede="Every detail tuned for translators, editors, and studios who refuse 'good enough'."
    >
      <h2>Translation</h2>
      <ul>
        <li><strong>Context-aware v4 engine</strong> — reads scene context, character tone, and idioms.</li>
        <li><strong>100+ languages</strong> including RTL, CJK, and low-resource dialects.</li>
        <li><strong>Custom glossaries</strong> for character names, brand terms, and house style.</li>
      </ul>
      <h2>Timing</h2>
      <ul>
        <li>Sub-frame waveform sync.</li>
        <li>Drift detection and auto-realign.</li>
        <li>Reading-speed governor per locale.</li>
      </ul>
      <h2>Workflow</h2>
      <ul>
        <li>Web, macOS, Windows, iOS — synced.</li>
        <li>Per-project history and version diffs.</li>
        <li>Roles, audit log, and team admin.</li>
      </ul>
      <p><Link to="/app">Try it now →</Link></p>
    </MarketingPage>
  ),
});
