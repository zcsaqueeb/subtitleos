<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Connector ownership

- Keep optional ElevenLabs and Sync.so bring-your-own API keys per browser, pass them only with the user's service requests, and prefer them over shared server keys; the app is open without login, so a shared account-wide key would let one visitor overwrite another's settings.

## Media loading

- Initialize browser media engines on an explicit processing action, sharing pending initialization promises; this avoids competing downloads and duplicate workers on mobile.
- Existing Android packaging is a website WebView, not a native all-offline deliverable; preserve its signing identity for maintenance, and never label wrapper upgrades as meeting the native requirement.
- Android local exports use the system document picker and chunked Blob reads without an exposed JavaScript bridge; media permission grants are restricted to the published origin and requested resources.
- Existing Windows packaging launches the published homepage with loopback recovery tools and exact-origin safeguards; it does not satisfy the requested complete offline app.

## Phone layout
- Keep phone touch sizing scoped to the app shell and use the shared Sheet for mobile navigation; desktop density and accessible focus handling stay intact.

## Activity pages
- Dashboard and History share a browser-safe activity adapter that combines existing server translations with browser-saved batches and transcripts; this keeps guest activity visible without changing account permissions or creating fabricated records.
- Account-only workspace and API-key controls reflect the existing session state without introducing a sign-in flow; personal provider credentials remain separate from SubtitleOS API credentials.

## Local media editing
- Editor and Burn use browser-only encoder initialization on explicit actions and check encoder exit codes, so failed commands cannot be presented as successful exports.
- Timed caption parsing and formatting live in a browser-safe shared module, so burn previews and converted captions use the same timing interpretation.
- Translator and transcription exports share browser-safe subtitle workflow helpers; batch ZIP paths are made unique before writing to avoid silently overwriting results.
- Translator cue review uses the shared timed-caption parser on the current edited output, so review and downloads do not maintain separate result copies.
- Video and audio summaries share browser-safe transcript import and export helpers, render Markdown without raw HTML, and reuse reviewed transcripts on regeneration to avoid duplicate transcription requests.
- Dubbing video exports initialize the shared browser encoder only on explicit actions, check exit codes, support cancellation, and use shared timing filters so recorded takes respect their selected video segment.
- Local subtitle drafts flush on page departure and backgrounding as well as debounce; show storage failures rather than claiming edits are saved.

## Homepage
- Keep homepage tool discovery browser-safe and link directly to existing studio routes; use shared Button, Sheet and Accordion controls so navigation stays accessible without initializing media engines.
- Host native installers as immutable CDN asset pointers and use same-origin download links on the homepage; this avoids bundling large installers into the website and keeps versioned downloads stable.

## Provider settings
- Keep additional keyless machine-translation adapters server-only and register their capability constraints in all subtitle and batch paths; self-hosted providers require an explicit reachable endpoint instead of an unreliable public default.
- Translation and speech provider drawers share an accessible browser-safe panel, retaining per-provider drafts only while open and leaving persistent credential formats unchanged to preserve personal settings.
- Source and output language selectors share language-options filtering; detection and mixed-audio modes remain source-only to avoid duplicate or invalid output choices.

## Themes
- Theme previews reuse global palette selectors on miniature surfaces; custom colors derive readable foreground tokens, and browser choices take precedence over remote defaults so previews can be canceled safely.
