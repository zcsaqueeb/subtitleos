# SubtitleOS

> **AI-powered subtitle localization for creators, studios, and localization teams.**
>
> Translate, transcribe, dub, and burn subtitles into video with a focus on tone, timing, cultural nuance, and speaker intent.

<p align="center">
  <a href="https://subtitleos.lovable.app"><strong>Visit the live application →</strong></a>
</p>

SubtitleOS is a subtitle localization platform designed to go beyond word-for-word translation. It helps preserve the meaning, style, and context of dialogue across languages and media workflows.

---

## Table of contents

- [Features](#features)
- [Supported subtitle formats](#supported-subtitle-formats)
- [Technology stack](#technology-stack)
- [Requirements](#requirements)
- [Getting started](#getting-started)
  - [Windows](#windows)
  - [macOS and Linux](#macos-and-linux)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Routing and server-side conventions](#routing-and-server-side-conventions)
- [Standalone mode](#standalone-mode)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)
- [License](#license)

---

## Features

- **Context-aware AI translation** — scene-aware and character-aware translation that aims to preserve idioms, humor, tone, and register.
- **100+ languages** — includes right-to-left (RTL) and CJK languages, low-resource dialects, and Professional Hinglish.
- **Style presets** — Netflix, Anime, Disney, Literal, Natural, and Dub.
- **Translation memory** — reuse previously approved translation segments.
- **Batch translation** — process multiple files and target languages from ZIP, RAR, 7z, and TAR archives, with live progress and provider fallback.
- **Transcription (STT)** — supports uploads up to approximately 3 GB or 3 hours, with chunked uploads, live preview, and per-chunk diagnostics.
- **Voice dubbing** — multi-character detection, emotion tagging, lip-sync, and optional voice cloning through your own ElevenLabs API key (BYOK).
- **Subtitle burn-in** — render subtitles into video in the browser using `ffmpeg.wasm`, with custom font uploads, embedded-track selection, and timing offsets.
- **AI summaries** — generate video and audio summaries with PDF and TXT export.
- **Team tools** — team workspaces, glossaries, API keys, and an admin panel with feature controls and audit logs.

## Supported subtitle formats

SubtitleOS supports the following formats:

`.srt`, `.vtt`, `.ass`, `.ssa`, `.sbv`, `.sub`, `.smi`, `.sami`, `.ttml`, `.dfxp`, `.stl`, `.scc`, `.cap`, `.xml`, and `.sup`.

## Technology stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start v1, React 19, SSR |
| Routing | TanStack Router (file-based) |
| Data fetching | TanStack Query |
| Build tooling | Vite |
| Styling | Tailwind CSS v4 (`src/styles.css`) |
| UI components | Radix UI and shadcn components |
| Backend | Lovable Cloud (Postgres, Auth, Storage) |
| AI | Lovable AI Gateway and optional BYOK providers |
| Payments | BTCPay, cryptocurrency, and UPI |
| Runtime | Edge (Cloudflare Workers) |

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer | [Download Node.js](https://nodejs.org/) |
| Bun | 1.1 or newer | Recommended package manager and script runner |
| Git | Recent version | Required to clone the repository |
| Browser | Latest Chrome, Edge, or Firefox | A modern browser is required for `ffmpeg.wasm` |

Bun is recommended, but npm can be used as an alternative.

---

## Getting started

### Windows

#### 1. Install Node.js

Download and install the LTS version from [nodejs.org](https://nodejs.org/). Keep the default installer options, including **Add to PATH**.

Open PowerShell and verify the installation:

```powershell
node -v
npm -v
```

#### 2. Install Bun (recommended)

Run the following command in PowerShell:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Close and reopen PowerShell, then verify:

```powershell
bun -v
```

If PowerShell does not recognize `bun`, reopen the terminal or use npm for the commands below.

#### 3. Get the project code

```powershell
cd $HOME\Documents
git clone <your-repo-url> subtitleos
cd subtitleos
```

Replace `<your-repo-url>` with the repository URL. If you downloaded the project as a ZIP file, extract it and open PowerShell in the extracted directory.

#### 4. Install dependencies

Using Bun:

```powershell
bun install
```

Or using npm:

```powershell
npm install
```

#### 5. Configure environment variables

Create a `.env` file in the project root and open it in Notepad:

```powershell
New-Item -ItemType File -Path .env
notepad .env
```

Add the required values described in [Environment variables](#environment-variables), then save the file.

#### 6. Start the development server

Using Bun:

```powershell
bun run dev
```

Or using npm:

```powershell
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser. Stop the server with `Ctrl + C`.

#### 7. Build and run for production (optional)

```powershell
bun run build
bun run start
```

#### Windows tips

- **Bun installation reports an execution policy error:** Open PowerShell as Administrator and run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then retry the installation.
- **Port 8080 is already in use:** Find the process with `netstat -ano | findstr :8080`, then stop it with `taskkill /PID <pid> /F` (replace `<pid>` with the process ID).
- **Long-path errors:** Enable Git long paths with `git config --global core.longpaths true`.
- **Slow dependency installation:** Antivirus real-time scanning may affect installation speed. Consider excluding the project directory if appropriate for your environment.
- **Using WSL:** Install Ubuntu through the Microsoft Store and follow the macOS/Linux instructions inside your WSL environment.

### macOS and Linux

Install Bun if it is not already installed:

```bash
curl -fsSL https://bun.sh/install | bash
```

Clone the repository and install dependencies:

```bash
git clone <your-repo-url> subtitleos
cd subtitleos
bun install
```

Create your local environment file if needed, then start the development server:

```bash
cp .env.example .env  # Or create .env manually
bun run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## Environment variables

Create a `.env` file in the project root when running the application outside Lovable Cloud.

```env
# Backend — client-visible values
VITE_SUPABASE_URL=your_backend_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_SUPABASE_PROJECT_ID=your_project_id

# Backend — server-only values
SUPABASE_URL=your_backend_url
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI gateway
LOVABLE_API_KEY=your_ai_gateway_key
```

### Environment variable security

- Values prefixed with `VITE_` are exposed to the browser. **Never store secrets in `VITE_` variables.**
- Variables without the `VITE_` prefix are server-only and must be accessed from server-side handlers.
- Do not commit `.env` files or secret credentials to version control.
- Lovable Cloud injects the required values automatically; local environment configuration is needed when running outside Lovable.

---

## Available scripts

| Command | Description |
|---|---|
| `bun run dev` | Start the development server on port 8080 with hot reload |
| `bun run build` | Create a production build |
| `bun run start` | Serve the production build locally |
| `bun run lint` | Run ESLint across the codebase |
| `bunx tsgo` | Run the TypeScript type check |
| `bunx vitest run` | Run the unit tests |

When using npm, replace `bun run` with `npm run` where an equivalent npm script is available.

---

## Project structure

```text
src/
├── routes/                 # File-based application routes
│   ├── __root.tsx          # Application shell and global layout
│   ├── index.tsx           # Landing page
│   ├── _authenticated/     # Signed-in application routes
│   └── api/public/         # Webhooks and public HTTP endpoints
├── components/             # Shared UI components
├── lib/                    # Application and business logic
│   ├── translation/        # Translation provider registry and dispatcher
│   ├── transcription/     # Speech-to-text provider registry and dispatcher
│   ├── *.functions.ts     # Server functions callable from the client
│   └── *.server.ts        # Server-only helpers
├── integrations/           # Backend and AI integrations
├── assets/                 # Images and avatars
└── styles.css              # Tailwind v4 theme and design tokens
```

---

## Routing and server-side conventions

- Every file in `src/routes` defines a route. The generated `routeTree.gen.ts` file must not be edited manually.
- Dots in route filenames represent URL path segments. For example, `dub.projects.$id.tsx` maps to `/dub/projects/:id`.
- Routes that require authentication belong under `src/routes/_authenticated/`.
- Application logic should use `createServerFn` in `*.functions.ts` files. External callers should use routes under `src/routes/api/public/`.
- Import `*.server.ts` modules only from server-side code.
- Create privileged clients inside server handlers; do not expose privileged credentials to the client.
- Use the design tokens defined in `src/styles.css` rather than hardcoding colors in components.

---

## Standalone mode

SubtitleOS can run without a Supabase project or a `LOVABLE_API_KEY`.

### Without backend credentials

A built-in local stub client in `src/lib/supabase-safe.ts` is used. Authentication returns a guest state, features remain unlocked and unlimited, and history, profile, and payment areas display empty states rather than causing the application to crash.

### Without an AI gateway key

Translation falls back to the available keyless engines (GTX, followed by Edge). No account or API key is required for this fallback path.

### Optional AI providers

Some capabilities require an AI model. To use Hinglish, transcription, dubbing, and summaries, add a supported provider key (OpenAI, Gemini, Claude, DeepL, or ElevenLabs) under **Settings → Providers**, or configure `LOVABLE_API_KEY`.

### Quick start without `.env`

```bash
npm install
npm run dev
```

Then open [http://localhost:8080](http://localhost:8080). No `.env` file is required for standalone mode.

---

## Troubleshooting

| Issue | Suggested resolution |
|---|---|
| Blank page after adding a route | Confirm that the route string in `createFileRoute("...")` matches the file path. |
| `Cannot find module` | Run `bun install` again. If the issue persists, remove `node_modules` and the lockfile, then reinstall dependencies. |
| Backend requests fail locally | Check the `.env` values and confirm that the Lovable Cloud backend is active. |
| Subtitle burn-in fails | Use a Chromium-based browser, keep the tab active, and try a smaller resolution or quality setting. |
| Translation provider returns a 4xx/5xx error | Switch providers in Studio settings. Batch mode includes provider fallback. |
| Styles are not applied correctly | Restart the development server so Tailwind can detect the styles in `styles.css`. |

---

## Deployment

The application is configured for an edge runtime and can be deployed through Lovable using **Publish**.

Deployment dependencies must be fully bundled and compatible with the Worker runtime. Native Node.js add-ons and `child_process` are not supported in this environment.

---

## License

This project is **private and all rights are reserved**.

---

<p align="center"><em>Built for the people who care about every line.</em></p>
