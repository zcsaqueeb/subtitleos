import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";

export const Route = createFileRoute("/roadmap")({
  head: () => ({ meta: [
      { name: "description", content: "Explore planned improvements to SubtitleOS translation and media tools." },
      { property: "og:title", content: "Roadmap \u2014 SubtitleOS" },
      { property: "og:description", content: "Explore planned improvements to SubtitleOS translation and media tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
{ title: "Roadmap — SubtitleOS" }] }),
  component: () => (
    <MarketingPage
      eyebrow="Roadmap"
      title={<>Where we’re <em className="text-gold-gradient italic">going</em>.</>}
      lede="No vaporware. Just the next few stops on the line."
    >
      <h2>Next</h2>
      <ul>
        <li>Native macOS &amp; Windows apps (beta).</li>
        <li>Collaborative review with comments and approvals.</li>
        <li>Auto-generated forced narratives.</li>
      </ul>
      <h2>Later</h2>
      <ul>
        <li>Voice clone dubbing pipeline (opt-in).</li>
        <li>On-device translation for sensitive material.</li>
        <li>Webhooks and a public REST API.</li>
      </ul>
    </MarketingPage>
  ),
});
