## Scope

1. Multi-Character Studio: accept a video upload → auto-transcribe to speaker-labeled script → existing character detection & per-voice dub → final lip-sync render.
2. Voice cloning: user picks between **ElevenLabs (cloud, high quality)** and **Browser clone (open source, on-device)** per project/character.

## 1. Video → Studio flow

**UI (`src/routes/_authenticated/dub.projects.tsx`)**
- Add a "Video (optional)" file input next to the SRT/script inputs (`accept="video/*,audio/*"`, up to ~3h / 3GB).
- When a video is picked: upload directly to the existing `lipsync-temp` bucket via a signed upload URL (reuse `createLipSyncUpload` pattern), then call a new `transcribeDubSource` server fn that runs the project's existing chunked transcription + speaker-diarized formatting and returns a `NAME: dialogue` script pre-populated into the textarea.
- Store the resulting `videoPath` on the project so the studio detail page can lip-sync later.

**Schema (`dub_projects`)**
- Add columns: `source_video_path text`, `source_video_name text`, `final_video_url text`, `lipsync_job_id text`, `lipsync_status text`.
- Grant + policy already covered by existing per-user policies (owner-only).

**Server (`src/lib/dub-projects.functions.ts`)**
- New `transcribeDubSource({ videoPath })`: signs URL, calls existing transcription dispatcher with speaker diarization prompt, returns `{ script, sourceLang }`.
- Extend `createDubProject` to accept optional `sourceVideoPath` / `sourceVideoName`.

**Studio detail page (`dub.projects.$id.tsx`)**
- After all lines have rendered audio, show a "Render final lip-synced video" button (only if the project has `source_video_path`).
- New server fn `startProjectLipSync({ projectId })`: concatenates all per-line audio into a single MP3 timeline (using existing per-line `audio_url` + start/end timestamps → server-side mixdown by simple sequential concat with silence padding to match cues), then calls `startLipSync` from `dub.functions.ts` with the stored video path.
- Poll via existing `pollLipSync`; when complete, save `final_video_url` and expose a download link.

## 2. Voice cloning: user choice

**Provider picker**
- Add a `clone_provider` column to `dub_characters` (default `"elevenlabs"`, other value `"browser"`).
- Character row UI gets a small `<select>` between "ElevenLabs (cloud)" and "Browser clone (open source)".

**Browser clone path (open source)**
- Client-side using `@xenova/transformers` (Transformers.js) with `Xenova/speecht5_tts` + a speaker embedding derived from the user's uploaded sample. Runs entirely in-browser (WebGPU/WASM), no server round-trip, no API key.
- Storage: raw sample stored in browser IndexedDB keyed by `characterId`; a computed speaker embedding cached alongside.
- Rendering: when a line's character uses `browser` clone, the studio detail page synthesizes the line locally via Transformers.js, uploads the resulting audio to `lipsync-temp/<user>/<project>/<line>.mp3`, and stores its signed URL on the line — matching the existing `audio_url` contract so lip-sync and export work unchanged.
- Warn users: larger initial download (~200MB model), lower quality than ElevenLabs, English-first (multilingual limited), slow on mobile.

**ElevenLabs path**
- Unchanged: existing `cloneVoice` + `synthesizeDub` continue to work when the character's `clone_provider = "elevenlabs"`.

## 3. Guardrails

- Feature-lock check (`lipsync`, `voice_cloning`) already exists — reuse for the new server fns.
- Video upload uses the same 3h/3GB + signed-URL pattern as `startLipSync`, so no memory blowups.
- Browser clone is fully optional; if the user's device can't load the model (WebGPU/WASM error), fall back with a toast suggesting ElevenLabs.

## Files touched

- `supabase/migrations/*` — new columns on `dub_projects`, `dub_characters`.
- `src/lib/dub-projects.functions.ts` — `transcribeDubSource`, `startProjectLipSync`, extended `createDubProject`.
- `src/lib/dub.functions.ts` — reuse `createLipSyncUpload`, `startLipSync`, `pollLipSync` (no changes).
- `src/lib/browser-clone.ts` (new) — Transformers.js loader, sample → embedding, synth helper, IndexedDB storage.
- `src/routes/_authenticated/dub.projects.tsx` — video/audio upload input, transcription progress, source persistence.
- `src/routes/_authenticated/dub.projects.$id.tsx` — per-character provider picker, browser-clone recording UI, final lip-sync render section.
- `package.json` — add `@xenova/transformers`.

## Notes / trade-offs

- The browser clone quality is meaningfully below ElevenLabs; the UI will label it "Experimental / open source" so expectations are set.
- The final "mix all lines into one audio track" step is done server-side with a naive time-aligned concat (silence padding between cues). If the user later wants proper crossfading/ducking we can layer that in.
