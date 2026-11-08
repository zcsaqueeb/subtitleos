import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { BatchZipTranslator } from "./app";
import { RecentBatches } from "@/components/recent-batches";
import { StudioPanel, useStudioSettings } from "@/components/studio-panel";

export const Route = createFileRoute("/_authenticated/batch")({
  head: () => ({
    meta: [
      { title: "Translator batch zip — SubtitleOS" },
      { name: "description", content: "Bulk-translate subtitle archives. Upload .zip/.tar/.tar.gz or individual subtitle files and translate them all at once." },
      { property: "og:title", content: "Translator batch zip — SubtitleOS" },
      { property: "og:description", content: "Bulk-translate subtitle archives and individual subtitle files at once." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BatchPage,
});

function BatchPage() {
  const [studio, setStudio] = useStudioSettings();

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Translator batch zip</h1>
        <p className="text-sm text-muted-foreground">Bulk-translate subtitle archives and folders.</p>
      </div>
      <div className="mb-4">
        <StudioPanel
          settings={studio}
          onChange={setStudio}
        />
      </div>
      <BatchZipTranslator />
      <RecentBatches />
    </AppShell>
  );
}
