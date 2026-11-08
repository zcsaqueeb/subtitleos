import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Flame,
  Upload,
  FileText,
  Loader2,
  Download,
  Bitcoin,
  Smartphone,
  Square,
  Wand2,
  Eye,
  Settings2,
  Type,
  Layers,
  Timer,
  ChevronLeft, ChevronRight, Play, Pause,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { parseFontFamily } from "@/lib/font-name";
import { Button } from "@/components/ui/button";
import { activeCaption, captionsToSrt, parseTimedCaptions, srtTimestamp } from "@/lib/media-tools";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

export const Route = createFileRoute("/_authenticated/burn")({
  head: () => ({
    meta: [
      { title: "Burn Subtitles into Video — SubtitleOS" },
      {
        name: "description",
        content:
          "Hard-burn SRT/VTT/ASS subtitles into your MP4/WebM/MOV video right in the browser — frame-accurate, styled, no upload to a third party.",
      },
      { property: "og:title", content: "Burn Subtitles into Video — SubtitleOS" },
      { property: "og:description", content: "Frame-accurate, fully styled subtitle burn-in that runs entirely in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BurnPage,
});

const VIDEO_RX = /\.(mp4|webm|mov|m4v|mkv|avi|ts)$/i;
const SUB_RX = /\.(srt|vtt|ass|ssa)$/i;
const FONT_RX = /\.(ttf|otf|ttc|woff|woff2)$/i;
const MAX_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB cap for in-browser ffmpeg (up to ~3 hours)

const FONTS = ["Inter", "Arial", "Roboto", "Helvetica", "Open Sans", "Noto Sans", "Impact", "Georgia"];

type CustomFont = { family: string; fileName: string; ext: string; bytes: ArrayBuffer };

type StyleState = {
  fontName: string;
  fontSize: number;
  primary: string;
  outline: string;
  outlineWidth: number;
  shadow: number;
  bold: boolean;
  align: number;
  marginV: number;
  boxOpacity: number; // 0 = no box, 1 = opaque box behind text
};

const PRESETS: { id: string; label: string; hint: string; style: Partial<StyleState> }[] = [
  { id: "netflix", label: "Netflix", hint: "White, soft shadow", style: { fontName: "Inter", fontSize: 48, primary: "#FFFFFF", outline: "#000000", outlineWidth: 1, shadow: 2, bold: false, boxOpacity: 0, align: 2, marginV: 60 } },
  { id: "youtube", label: "YouTube", hint: "Boxed caption", style: { fontName: "Roboto", fontSize: 44, primary: "#FFFFFF", outline: "#000000", outlineWidth: 0, shadow: 0, bold: false, boxOpacity: 0.75, align: 2, marginV: 50 } },
  { id: "anime", label: "Anime fansub", hint: "Bold, thick outline", style: { fontName: "Arial", fontSize: 52, primary: "#FFFFFF", outline: "#000000", outlineWidth: 3, shadow: 1, bold: true, boxOpacity: 0, align: 2, marginV: 55 } },
  { id: "cinema", label: "Cinema", hint: "Warm, high contrast", style: { fontName: "Georgia", fontSize: 50, primary: "#F5E6C8", outline: "#1A1208", outlineWidth: 2, shadow: 2, bold: false, boxOpacity: 0, align: 2, marginV: 70 } },
];

function assHex(c: string, alphaPct = 0) {
  const m = c.replace("#", "");
  const r = m.substring(0, 2), g = m.substring(2, 4), b = m.substring(4, 6);
  const a = Math.round(Math.min(1, Math.max(0, alphaPct)) * 255).toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function srtToAss(srt: string, s: StyleState, playResX: number, playResY: number) {
  const borderStyle = s.boxOpacity > 0 ? 3 : 1;
  const backColour = assHex("#000000", 1 - s.boxOpacity);
  const outlineForBox = s.boxOpacity > 0 ? Math.max(1, s.outlineWidth) : s.outlineWidth;
  const header =
    `[Script Info]\nScriptType: v4.00+\nPlayResX: ${playResX}\nPlayResY: ${playResY}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n` +
    `[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    `Style: Default,${s.fontName},${s.fontSize},${assHex(s.primary)},${assHex(s.primary)},${assHex(s.outline)},${backColour},${s.bold ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${outlineForBox},${s.shadow},${s.align},60,60,${s.marginV},1\n\n` +
    `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

  const toAssTime = (t: string) => {
    const [hms, ms] = t.split(",");
    const [h, m, sec] = hms.split(":");
    const cs = String(Math.floor(Number(ms || "0") / 10)).padStart(2, "0");
    return `${Number(h)}:${m}:${sec}.${cs}`;
  };
  const blocks = srt.replace(/\r/g, "").split(/\n\n+/).filter(Boolean);
  const lines: string[] = [];
  for (const b of blocks) {
    const ls = b.split("\n");
    const timeIdx = ls.findIndex((l) => /\d+:\d+:\d+,\d+\s*-->/.test(l));
    if (timeIdx === -1) continue;
    const [start, end] = ls[timeIdx].split("-->").map((x) => x.trim());
    const text = ls
      .slice(timeIdx + 1)
      .join("\\N")
      .replace(/[{}]/g, "")
      .replace(/<\/?[^>]+>/g, "");
    if (!text.trim()) continue;
    lines.push(`Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${text}`);
  }
  return header + lines.join("\n") + "\n";
}

/** Shift Dialogue/Comment timestamps inside an ASS/SSA script. */
function shiftAss(ass: string, sec: number) {
  if (!sec) return ass;
  const shiftOne = (t: string) => {
    const m = t.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
    if (!m) return t;
    const total = Math.max(0, Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 100 + sec) * 100));
    const hh = Math.floor(total / 360000);
    const mm = Math.floor(total / 6000) % 60;
    const ss = Math.floor(total / 100) % 60;
    const cs = total % 100;
    return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };
  return ass
    .split("\n")
    .map((line) => {
      if (!/^(Dialogue|Comment):/.test(line)) return line;
      const parts = line.split(",");
      if (parts.length < 3) return line;
      parts[1] = shiftOne(parts[1].trim());
      parts[2] = shiftOne(parts[2].trim());
      return parts.join(",");
    })
    .join("\n");
}

export type SubStream = { index: number; codec: string; lang?: string; title?: string; textBased: boolean };

const TEXT_SUB_CODECS = /^(subrip|srt|ass|ssa|mov_text|webvtt|text|eia_608|subviewer|microdvd)/i;

/** Parse `Stream #0:2(eng): Subtitle: subrip (default) (title)` lines out of an ffmpeg log. */
function parseSubStreams(log: string): SubStream[] {
  const out: SubStream[] = [];
  const lines = log.split("\n");
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/Stream #\d+:\d+(?:\[[^\]]*\])?(?:\(([^)]+)\))?:\s*Subtitle:\s*([a-z0-9_]+)/i);
    if (!m) continue;
    let title: string | undefined;
    const meta = lines[i + 1]?.match(/title\s*:\s*(.+)/i) || lines[i + 2]?.match(/title\s*:\s*(.+)/i);
    if (meta) title = meta[1].trim();
    const codec = m[2].toLowerCase();
    out.push({ index: n++, codec, lang: m[1], title, textBased: TEXT_SUB_CODECS.test(codec) });
  }
  return out;
}

function fmtTime(sec: number) {
  if (!isFinite(sec) || sec < 0) return "—";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

const STATE_KEY = "burn:state:v2";
type BurnPersist = StyleState & {
  subFileName?: string;
  subText?: string;
  videoName?: string;
  videoSize?: number;
  outName: string;
  crf: number;
  speed: string;
  scale: string;
  offset?: number;
  pendingRender?: boolean;
};

const DEFAULT_STYLE: StyleState = {
  fontName: "Inter", fontSize: 48, primary: "#FFFFFF", outline: "#000000",
  outlineWidth: 2, shadow: 1, bold: false, align: 2, marginV: 60, boxOpacity: 0,
};

function BurnPage() {

  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [dims, setDims] = useState<{ w: number; h: number; dur: number } | null>(null);
  const [subFile, setSubFile] = useState<File | null>(null);
  const [subText, setSubText] = useState<string>("");
  const [style, setStyle] = useState<StyleState>(DEFAULT_STYLE);
  const [crf, setCrf] = useState(20);
  const [speed, setSpeed] = useState("veryfast");
  const [scale, setScale] = useState("source");
  const [dragOver, setDragOver] = useState<"video" | "sub" | "font" | null>(null);
  const [customFont, setCustomFont] = useState<CustomFont | null>(null);
  const [tracks, setTracks] = useState<SubStream[] | null>(null);
  const [trackIdx, setTrackIdx] = useState<number | null>(null); // null = use the uploaded subtitle file
  const [scanning, setScanning] = useState(false);
  const [offset, setOffset] = useState(0); // seconds, +/- nudge for burned captions

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [phase, setPhase] = useState("");
  const [log, setLog] = useState<string>("");
  const [outUrl, setOutUrl] = useState<string>("");
  const [outSize, setOutSize] = useState(0);
  const [outName, setOutName] = useState<string>("burned.mp4");
  const [resumeInfo, setResumeInfo] = useState<BurnPersist | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const operationRef = useRef(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState<"timed" | "style">("timed");
  const [burnError, setBurnError] = useState("");
  const encoderLoadingRef = useRef<Promise<any> | null>(null);
  const cancelRef = useRef(false);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const set = <K extends keyof StyleState>(k: K, v: StyleState[K]) => setStyle((s) => ({ ...s, [k]: v }));

  useEffect(() => () => { if (outUrl) URL.revokeObjectURL(outUrl); }, [outUrl]);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => () => { cancelRef.current = true; abortRef.current?.abort(); ffmpegRef.current?.terminate(); }, []);

  // Elapsed / ETA ticker
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [busy]);

  const elapsed = busy && startedAt ? (now - startedAt) / 1000 : 0;
  const eta = progress > 2 ? (elapsed / progress) * (100 - progress) : NaN;

  // Restore persisted settings + detect interrupted render on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as BurnPersist;
      setStyle({ ...DEFAULT_STYLE, ...s });
      if (s.outName) setOutName(s.outName);
      if (typeof s.crf === "number") setCrf(s.crf);
      if (s.speed) setSpeed(s.speed);
      if (s.scale) setScale(s.scale);
      if (typeof s.offset === "number") setOffset(s.offset);
      if (s.subText) { setSubText(s.subText); setSubFile(new File([s.subText], s.subFileName || "subs.srt")); }
      if (s.pendingRender) setResumeInfo(s);
    } catch { /* ignore */ }
  }, []);

  // Persist settings.
  useEffect(() => {
    try {
      const s: BurnPersist = {
        ...style,
        subFileName: subFile?.name, subText,
        videoName: video?.name, videoSize: video?.size,
        outName, crf, speed, scale, offset,
        pendingRender: busy,
      };
      const serialized = JSON.stringify(s);
      localStorage.setItem(STATE_KEY, serialized.length <= 4_500_000
        ? serialized
        : JSON.stringify({ ...s, subText: undefined, pendingRender: false }));
    } catch { /* quota */ }
  }, [subFile, subText, video, style, outName, crf, speed, scale, offset, busy]);

  async function loadFfmpeg(silent = false) {
    if (ffmpegRef.current) return ffmpegRef.current;
    if (!silent) setPhase("Loading encoder…");
    if (encoderLoadingRef.current) return encoderLoadingRef.current;
    encoderLoadingRef.current = createEncoder();
    try { return await encoderLoadingRef.current; }
    finally { encoderLoadingRef.current = null; }
  }

  async function createEncoder() {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { initializeEncoder } = await import("@/lib/browser-encoder");
    const ff = new FFmpeg();
    ff.on("progress", ({ progress }) => { if (!cancelRef.current) setProgress(Math.round(Math.min(0.99, Math.max(0, progress)) * 100)); });
    ff.on("log", ({ message }) => { if (!cancelRef.current) setLog((s) => (s + "\n" + message).slice(-6000)); });
    await initializeEncoder(ff, abortRef.current?.signal);
    if (cancelRef.current) { ff.terminate(); throw new Error("Cancelled"); }
    ffmpegRef.current = ff;
    return ff;
  }

  function onPickVideo(f: File | null) {
    if (!f || operationRef.current) return;
    if (!VIDEO_RX.test(f.name)) { toast.error("Pick an MP4, WebM, MOV, M4V, MKV, AVI or TS file."); return; }
    if (f.size > MAX_BYTES) { toast.error("Video too large for in-browser burn (max 3 GB / ~3 hours)."); return; }
    setVideo(f);
    setDims(null); setPreviewTime(0); setOutUrl(""); setBurnError("");
    setTracks(null);
    setTrackIdx(null);
    setVideoUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    setOutName(f.name.replace(/\.[^.]+$/, "") + ".burned.mp4");
  }

  /** Probe the source video for embedded subtitle streams. */
  async function scanTracks() {
    if (!video || operationRef.current) return;
    operationRef.current = true; cancelRef.current = false;
    abortRef.current = new AbortController();
    setScanning(true);
    try {
      const ff = await loadFfmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      setPhase("Scanning subtitle tracks…");
      const vname = "probe" + (video.name.match(/\.[^.]+$/)?.[0] || ".mp4");
      await ff.writeFile(vname, await fetchFile(video));
      let probeLog = "";
      const onLog = ({ message }: { message: string }) => { probeLog += "\n" + message; };
      ff.on("log", onLog);
      try { await ff.exec(["-hide_banner", "-i", vname]); } catch { /* ffmpeg exits non-zero with no output file */ }
      ff.off?.("log", onLog);
      try { await ff.deleteFile(vname); } catch { /* noop */ }
      const found = parseSubStreams(probeLog);
      setTracks(found);
      if (!found.length) toast.message("No embedded subtitle tracks found in this video.");
      else toast.success(`Found ${found.length} subtitle track${found.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(`Track scan failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScanning(false); operationRef.current = false; abortRef.current = null;
      setPhase("");
    }
  }

  async function onPickSub(f: File | null) {
    if (!f) return;
    if (!SUB_RX.test(f.name)) { toast.error("Pick an .srt, .vtt, .ass, or .ssa file."); return; }
    const text = await f.text();
    if (!parseTimedCaptions(text).length) { toast.error("No valid timed captions found in this file."); return; }
    setTrackIdx(null); setOutUrl(""); setBurnError("");
    setSubFile(f);
    setSubText(text);
  }

  async function onPickFont(f: File | null) {
    if (!f) return;
    if (!FONT_RX.test(f.name)) { toast.error("Pick a .ttf, .otf, .ttc, .woff or .woff2 font file."); return; }
    if (f.size > 20 * 1024 * 1024) { toast.error("Font file too large (max 20 MB)."); return; }
    const bytes = await f.arrayBuffer();
    const ext = (f.name.match(/\.[^.]+$/)?.[0] || ".ttf").toLowerCase();
    const parsed = parseFontFamily(bytes);
    const family = parsed || f.name.replace(/\.[^.]+$/, "");
    try {
      const face = new FontFace(family, bytes.slice(0));
      await face.load();
      (document.fonts as unknown as FontFaceSet).add(face);
    } catch {
      toast.message("Font loaded for rendering, but the browser preview can't display it.");
    }
    setCustomFont({ family, fileName: f.name, ext, bytes });
    set("fontName", family);
    toast.success(`Custom font ready: ${family}`);
  }

  function onDrop(e: React.DragEvent, kind: "video" | "sub" | "font") {
    e.preventDefault();
    setDragOver(null);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      if (VIDEO_RX.test(f.name)) onPickVideo(f);
      else if (SUB_RX.test(f.name)) void onPickSub(f);
      else if (FONT_RX.test(f.name)) void onPickFont(f);
      else if (kind === "video") toast.error(`Unsupported file: ${f.name}`);
    }
  }


  const isAss = trackIdx === null && /\.ass$|\.ssa$/i.test(subFile?.name || "");
  const captionList = useMemo(() => parseTimedCaptions(subText), [subText]);
  const cues = captionList.length;
  const sampleText = previewMode === "style" || !videoUrl
    ? captionList[0]?.text || "Subtitle preview"
    : activeCaption(captionList, previewTime, offset);
  const selectedCue = captionList.findIndex((cue) => previewTime >= cue.start + offset && previewTime < cue.end + offset);
  function jumpCue(direction: -1 | 1) {
    const index = direction === 1
      ? captionList.findIndex((cue) => cue.start + offset > previewTime + 0.01)
      : captionList.reduce((last, cue, i) => cue.start + offset < previewTime - 0.01 ? i : last, -1);
    const cue = captionList[index];
    if (!cue || !previewRef.current) return;
    const time = Math.max(0, cue.start + offset);
    previewRef.current.currentTime = time;
    setPreviewTime(time);
  }

  async function burn() {
    if (operationRef.current) return;
    const useEmbedded = trackIdx !== null;
    if (!video || (!subText && !useEmbedded)) { toast.error("Add a video and a subtitle source first."); return; }
    operationRef.current = true;
    abortRef.current = new AbortController();
    setBurnError(""); setResumeInfo(null);
    setBusy(true); setProgress(0); setLog(""); setOutUrl(""); setOutSize(0);
    setStartedAt(Date.now()); setNow(Date.now());
    cancelRef.current = false;
    try {
      const ff = await loadFfmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      const { runEncoder } = await import("@/lib/browser-encoder");
      setPhase("Loading video into memory…");
      const vname = "in" + (video.name.match(/\.[^.]+$/)?.[0] || ".mp4");
      await ff.writeFile(vname, await fetchFile(video));

      const playResY = 1080;
      const playResX = dims?.h ? Math.round(dims.w / dims.h * playResY) : 1920;
      let assText: string;
      if (useEmbedded) {
        setPhase(`Extracting subtitle track #${(trackIdx ?? 0) + 1}…`);
        await runEncoder(ff, ["-i", vname, "-map", `0:s:${trackIdx}`, "-c:s", "srt", "-y", "track.srt"]);
        const raw = await ff.readFile("track.srt");
        const extracted = new TextDecoder().decode(raw as unknown as Uint8Array);
        if (!extracted.trim()) throw new Error("The selected subtitle track is empty or image-based.");
        assText = srtToAss(captionsToSrt(parseTimedCaptions(extracted), offset), style, playResX, playResY);
        try { await ff.deleteFile("track.srt"); } catch { /* noop */ }
      } else if (isAss) {
        assText = shiftAss(subText, offset);
      } else {
        const srt = captionsToSrt(captionList, offset);
        if (!srt) throw new Error("No captions remain after applying the timing offset.");
        assText = srtToAss(srt, style, playResX, playResY);
      }
      await ff.writeFile("subs.ass", new TextEncoder().encode(assText));

      // Make an uploaded typeface available to libass (matched by family name).
      const fontsDir = "/fonts";
      try { await ff.createDir(fontsDir); } catch { /* already exists */ }
      setPhase("Preparing subtitle font…");
      const fontResponse = await fetch("https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter%5Bopsz,wght%5D.ttf", { signal: abortRef.current?.signal });
      if (!fontResponse.ok) throw new Error("The subtitle font could not be downloaded. Check your connection and try again.");
      await ff.writeFile("/fonts/default.ttf", new Uint8Array(await fontResponse.arrayBuffer()));
      if (customFont) {
        setPhase("Embedding custom font…");
        try { await ff.createDir("/fonts"); } catch { /* already exists */ }
        await ff.writeFile(`/fonts/custom${customFont.ext}`, new Uint8Array(customFont.bytes.slice(0)));
      }

      if (cancelRef.current) throw new Error("Cancelled");

      const vf = [
        scale !== "source" ? `scale=-2:${scale}` : "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        fontsDir ? `ass=subs.ass:fontsdir=${fontsDir}` : "ass=subs.ass",
      ].filter(Boolean).join(",");

      const baseArgs = (audio: string[]) => [
        "-i", vname,
        "-map", "0:v:0", "-map", "0:a?",
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", speed,
        "-crf", String(crf),
        "-pix_fmt", "yuv420p",
        ...audio,
        "-movflags", "+faststart",
        "-y",
        "out.mp4",
      ];

      setPhase("Rendering subtitles into video…");
      try {
        await runEncoder(ff, baseArgs(["-c:a", "copy"]));
      } catch (e) {
        if (cancelRef.current) throw new Error("Cancelled");
        // Audio codec not MP4-compatible (Opus/Vorbis in WebM/MKV) — re-encode to AAC.
        setPhase("Re-encoding audio to AAC…");
        setLog((s) => s + "\n[retry] audio stream copy failed — re-encoding to AAC");
        await runEncoder(ff, baseArgs(["-c:a", "aac", "-b:a", "192k"]));
      }

      if (cancelRef.current) throw new Error("Cancelled");
      const data = await ff.readFile("out.mp4");
      const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
      if (!blob.size) throw new Error("Encoder produced an empty file — check the FFmpeg log below.");
      setOutSize(blob.size);
      setOutUrl(URL.createObjectURL(blob));
      toast.success("Burned video ready — preview and download below.");
      try { await ff.deleteFile(vname); await ff.deleteFile("out.mp4"); } catch { /* noop */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "Cancelled" && !cancelRef.current) { setBurnError(msg); toast.error(`Burn failed: ${msg}`); }
      else toast("Cancelled.");
    } finally {
      ffmpegRef.current?.terminate(); ffmpegRef.current = null;
      operationRef.current = false; abortRef.current = null;
      setBusy(false);
      setProgress(0);
      setPhase("");
    }
  }

  function cancel() {
    cancelRef.current = true;
    abortRef.current?.abort();
    try { ffmpegRef.current?.terminate(); } catch { /* noop */ }
    ffmpegRef.current = null;
    setPhase("Cancelling…");
  }


  // Live preview placement
  const previewAlign = (() => {
    const a = style.align;
    const vertical = a >= 7 ? "flex-start" : a >= 4 ? "center" : "flex-end";
    const horizontal = a % 3 === 1 ? "flex-start" : a % 3 === 0 ? "flex-end" : "center";
    return { vertical, horizontal };
  })();

  return (
    <AppShell>
      <BackButton />
      <div className="mb-6 mt-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15">
          <Flame className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Burn Subtitles into Video</h1>
          <p className="text-sm text-muted-foreground">Burn Subtitles · MP4 export</p>
        </div>
      </div>

      {resumeInfo && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs">
          <div>
            <div className="font-medium text-foreground">Resume previous render</div>
            <div className="mt-1 text-muted-foreground">
              We saved your subtitle file and style settings. Re-pick <span className="font-mono">{resumeInfo.videoName}</span> ({((resumeInfo.videoSize ?? 0) / 1024 / 1024).toFixed(1)} MB) then choose Burn subtitles to restart.
            </div>
          </div>
          <Button variant="outline"
            type="button"
            onClick={() => { setResumeInfo(null); try { const raw = localStorage.getItem(STATE_KEY); if (raw) { const s = JSON.parse(raw); s.pendingRender = false; localStorage.setItem(STATE_KEY, JSON.stringify(s)); } } catch { /* ignore */ } }}
            className="shrink-0 rounded-md border border-border bg-card px-2 py-1 hover:bg-accent"
          >Dismiss</Button>
        </div>
      )}

      <fieldset disabled={busy || scanning} className="min-w-0 border-0 p-0">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Files */}
        <div className="border-t border-border py-5">
          <h2 className="mb-3 text-sm font-semibold">1. Files</h2>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver("video"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(e, "video")}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors ${dragOver === "video" ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-background/60"}`}
          >
            <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{video?.name ?? "Drop or pick a video (MP4 / WebM / MOV / MKV / AVI)"}</span>
            <input type="file" accept="video/*,.mkv,.ts" className="hidden" onChange={(e) => onPickVideo(e.target.files?.[0] ?? null)} />
          </label>

          {/* Embedded subtitle track selector */}
          {video && (
            <div className="mt-2 rounded-lg border border-border bg-background/40 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-foreground"><Layers className="h-3.5 w-3.5" /> Subtitle source</span>
                <Button variant="outline"
                  type="button"
                  onClick={scanTracks}
                  disabled={scanning || busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 hover:bg-accent disabled:opacity-50"
                >
                  {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />}
                  {tracks ? "Rescan tracks" : "Scan embedded tracks"}
                </Button>
              </div>
              {tracks && tracks.length > 0 ? (
                <select
                  value={trackIdx === null ? "file" : String(trackIdx)}
                  onChange={(e) => setTrackIdx(e.target.value === "file" ? null : Number(e.target.value))}
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5"
                >
                  <option value="file">Uploaded subtitle file{subFile ? ` — ${subFile.name}` : " (none picked)"}</option>
                  {tracks.map((t) => (
                    <option key={t.index} value={t.index} disabled={!t.textBased}>
                      Track {t.index + 1}{t.lang ? ` · ${t.lang}` : ""}{t.title ? ` · ${t.title}` : ""} · {t.codec}
                      {t.textBased ? "" : " (image-based — unsupported)"}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {tracks ? "No embedded subtitle tracks in this video — use the uploaded file below." : "Scan to pick a caption track baked into the video (MKV/MP4 with multiple languages)."}
                </p>
              )}
            </div>
          )}

          {/* Timing offset */}
          <div className="mt-2 rounded-lg border border-border bg-background/40 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium text-foreground"><Timer className="h-3.5 w-3.5" /> Timing offset</span>
              <span className="tabular-nums text-muted-foreground">{offset > 0 ? "+" : ""}{offset.toFixed(1)}s</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="outline" type="button" onClick={() => setOffset((o) => Math.round((o - 0.1) * 10) / 10)} className="rounded-md border border-border bg-card px-2 py-1 hover:bg-accent">−0.1</Button>
              <input
                type="range" min={-30} max={30} step={0.1} value={offset}
                onChange={(e) => setOffset(Number(e.target.value))}
                className="flex-1 accent-[var(--primary)]"
              />
              <Button variant="outline" type="button" onClick={() => setOffset((o) => Math.round((o + 0.1) * 10) / 10)} className="rounded-md border border-border bg-card px-2 py-1 hover:bg-accent">+0.1</Button>
              <Button variant="outline" type="button" onClick={() => setOffset(0)} className="rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground hover:bg-accent">Reset</Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Negative shows captions earlier, positive delays them. Applied when the video is rendered.
            </p>
          </div>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver("sub"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(e, "sub")}
            className={`mt-2 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors ${dragOver === "sub" ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-background/60"}`}
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{subFile?.name ?? "Drop or pick subtitles (.srt / .vtt / .ass)"}</span>
            <input type="file" accept=".srt,.vtt,.ass,.ssa" className="hidden" onChange={(e) => onPickSub(e.target.files?.[0] ?? null)} />
          </label>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver("font"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(e, "font")}
            className={`mt-2 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors ${dragOver === "font" ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-background/60"}`}
          >
            <Type className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {customFont ? `Custom font: ${customFont.family}` : "Drop or pick a custom font (.ttf / .otf / .woff2) — optional"}
            </span>
            <input type="file" accept=".ttf,.otf,.ttc,.woff,.woff2,font/*" className="hidden" onChange={(e) => onPickFont(e.target.files?.[0] ?? null)} />
          </label>
          {customFont && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate">{customFont.fileName}</span>
              <Button variant="outline"
                type="button"
                onClick={() => { setCustomFont(null); set("fontName", DEFAULT_STYLE.fontName); }}
                className="shrink-0 rounded px-2 py-0.5 hover:bg-accent hover:text-foreground"
              >
                Remove
              </Button>
            </div>
          )}

          {(video || subFile) && (
            <div className="mt-3 grid gap-1 text-[11px] text-muted-foreground">
              {video && (
                <div>
                  Video: {(video.size / 1024 / 1024).toFixed(1)} MB
                  {dims ? ` · ${dims.w}×${dims.h} · ${fmtTime(dims.dur)}` : " · reading metadata…"}
                </div>
              )}
              {subFile && <div>Subtitles: {cues} cue{cues === 1 ? "" : "s"}{isAss ? " · ASS/SSA styling preserved (style controls disabled)" : ""}</div>}
            </div>
          )}

          <label className="mt-3 grid gap-1 text-xs">
            <span className="text-muted-foreground">Output file name</span>
            <input value={outName} onChange={(e) => setOutName(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5" />
          </label>
        </div>

        {/* Live preview */}
        <div className="border-t border-border py-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4" /> Live preview</h2>
          <div className="relative overflow-hidden rounded-lg bg-ink" style={{ aspectRatio: dims?.h ? `${dims.w} / ${dims.h}` : "16 / 9", containerType: "size" }}>
            {videoUrl ? (
              <video
                ref={previewRef}
                src={videoUrl}
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
                onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime)}
                onPlay={() => setPreviewPlaying(true)}
                onPause={() => setPreviewPlaying(false)}
                onSeeked={(e) => setPreviewTime(e.currentTarget.currentTime)}
                onError={() => setBurnError("Your browser cannot preview this video format. An MP4 with H.264 video is recommended.")}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setDims({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
                  setPreviewTime(v.currentTime);
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                Pick a video to preview your subtitle style on a real frame
              </div>
            )}
            {!isAss && sampleText && trackIdx === null && (
              <div
                className="pointer-events-none absolute inset-0 flex px-[6%]"
                style={{
                  alignItems: previewAlign.vertical,
                  justifyContent: previewAlign.horizontal,
                  paddingBottom: `${(style.marginV / 1080) * 100}cqh`,
                  paddingTop: `${(style.marginV / 1080) * 100}cqh`,
                }}
              >
                <span
                  className="max-w-full whitespace-pre-line break-words text-center leading-tight"
                  style={{
                    fontFamily: `${style.fontName}, sans-serif`,
                    fontWeight: style.bold ? 800 : 500,
                    color: style.primary,
                    fontSize: `${(style.fontSize / 1080) * 100}cqh`,
                    background: style.boxOpacity > 0 ? `rgba(0,0,0,${style.boxOpacity})` : "transparent",
                    padding: style.boxOpacity > 0 ? "0.15em 0.5em" : 0,
                    borderRadius: style.boxOpacity > 0 ? "0.2em" : 0,
                    textShadow: style.boxOpacity > 0
                      ? "none"
                      : [
                          ...(style.outlineWidth > 0
                            ? [`0 0 ${style.outlineWidth}px ${style.outline}`, `${style.outlineWidth}px ${style.outlineWidth}px 0 ${style.outline}`, `-${style.outlineWidth}px ${style.outlineWidth}px 0 ${style.outline}`, `${style.outlineWidth}px -${style.outlineWidth}px 0 ${style.outline}`, `-${style.outlineWidth}px -${style.outlineWidth}px 0 ${style.outline}`]
                            : []),
                          ...(style.shadow > 0 ? [`${style.shadow * 2}px ${style.shadow * 2}px ${style.shadow * 2}px rgba(0,0,0,0.8)`] : []),
                        ].join(", ") || "none",
                  }}
                >
                  {sampleText}
                </span>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {videoUrl && (
              <div className="flex w-full flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" aria-label={previewPlaying ? "Pause preview" : "Play preview"} title={previewPlaying ? "Pause preview" : "Play preview"} onClick={() => {
                  const v = previewRef.current;
                  if (!v) return;
                  if (v.paused) void v.play().catch(() => toast.error("This video cannot be played in your browser."));
                  else v.pause();
                }}>{previewPlaying ? <Pause /> : <Play />}</Button>
                <input aria-label="Preview position" type="range" min={0} max={dims?.dur || 1} step={0.01} value={previewTime} className="min-w-20 flex-1 accent-primary" onChange={(e) => {
                  const time = Number(e.target.value);
                  if (previewRef.current) previewRef.current.currentTime = time;
                  setPreviewTime(time);
                }} />
                <span className="text-xs tabular-nums text-muted-foreground">{srtTimestamp(previewTime).slice(3, -1).replace(",", ".")}</span>
              </div>
            )}
            <div className="flex items-center gap-1" role="group" aria-label="Caption preview mode">
              <Button size="sm" variant={previewMode === "timed" ? "secondary" : "ghost"} onClick={() => setPreviewMode("timed")} aria-pressed={previewMode === "timed"}>Timed captions</Button>
              <Button size="sm" variant={previewMode === "style" ? "secondary" : "ghost"} onClick={() => setPreviewMode("style")} aria-pressed={previewMode === "style"}>Style sample</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" title="Previous caption" aria-label="Previous caption" disabled={!videoUrl || !cues} onClick={() => jumpCue(-1)}><ChevronLeft /></Button>
              <span className="text-xs tabular-nums text-muted-foreground">{selectedCue >= 0 ? selectedCue + 1 : "—"} / {cues}</span>
              <Button size="icon" variant="outline" title="Next caption" aria-label="Next caption" disabled={!videoUrl || !cues} onClick={() => jumpCue(1)}><ChevronRight /></Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isAss ? "ASS/SSA file detected — its own styling is used as-is." : "Preview approximates the final render. Scrub the video to check different scenes."}
          </p>
        </div>
      </div>

      {/* Style */}
      <div className="mt-4 border-t border-border py-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4" /> 2. Style</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button variant="outline"
              key={p.id}
              type="button"
              disabled={isAss}
              onClick={() => setStyle((s) => ({ ...s, ...p.style }))}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:border-primary hover:bg-accent disabled:opacity-40"
              title={p.hint}
            >
              {p.label}
            </Button>
          ))}
          <Button variant="outline" type="button" disabled={isAss} onClick={() => setStyle(DEFAULT_STYLE)} className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40">
            Reset
          </Button>
        </div>
        <fieldset disabled={isAss} className="grid grid-cols-2 gap-3 text-xs disabled:opacity-50 md:grid-cols-4">
          <label className="grid gap-1">
            <span className="text-muted-foreground">Font</span>
            <select value={style.fontName} onChange={(e) => set("fontName", e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5">
              {customFont && (
                <optgroup label="Uploaded">
                  <option value={customFont.family}>{customFont.family} (custom)</option>
                </optgroup>
              )}
              <optgroup label="Built-in">
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Size ({style.fontSize})</span>
            <input type="range" min={16} max={120} value={style.fontSize} onChange={(e) => set("fontSize", Number(e.target.value))} className="accent-[var(--primary)]" />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Text color</span>
            <input type="color" value={style.primary} onChange={(e) => set("primary", e.target.value)} className="h-9 w-full rounded-md border border-border bg-background" />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Outline color</span>
            <input type="color" value={style.outline} onChange={(e) => set("outline", e.target.value)} className="h-9 w-full rounded-md border border-border bg-background" />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Outline width ({style.outlineWidth})</span>
            <input type="range" min={0} max={8} value={style.outlineWidth} onChange={(e) => set("outlineWidth", Number(e.target.value))} className="accent-[var(--primary)]" />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Shadow ({style.shadow})</span>
            <input type="range" min={0} max={6} value={style.shadow} onChange={(e) => set("shadow", Number(e.target.value))} className="accent-[var(--primary)]" />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Background box ({Math.round(style.boxOpacity * 100)}%)</span>
            <input type="range" min={0} max={100} value={Math.round(style.boxOpacity * 100)} onChange={(e) => set("boxOpacity", Number(e.target.value) / 100)} className="accent-[var(--primary)]" />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Bottom / top margin ({style.marginV})</span>
            <input type="range" min={10} max={240} value={style.marginV} onChange={(e) => set("marginV", Number(e.target.value))} className="accent-[var(--primary)]" />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Position</span>
            <select value={style.align} onChange={(e) => set("align", Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1.5">
              <option value={2}>Bottom center</option>
              <option value={1}>Bottom left</option>
              <option value={3}>Bottom right</option>
              <option value={8}>Top center</option>
              <option value={5}>Middle center</option>
            </select>
          </label>
          <label className="flex items-end gap-2 pb-1.5">
            <input type="checkbox" checked={style.bold} onChange={(e) => set("bold", e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            <span className="text-muted-foreground">Bold</span>
          </label>
        </fieldset>
      </div>

      {/* Output settings */}
      <div className="mt-4 border-t border-border py-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4" /> 3. Output</h2>
        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-muted-foreground">Quality (CRF {crf})</span>
            <input type="range" min={14} max={30} value={crf} onChange={(e) => setCrf(Number(e.target.value))} className="accent-[var(--primary)]" />
            <span className="text-[10px] text-muted-foreground">{crf <= 17 ? "Near-lossless, big file" : crf <= 22 ? "Balanced (recommended)" : "Smaller file, softer"}</span>
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Encoding speed</span>
            <select value={speed} onChange={(e) => setSpeed(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5">
              <option value="ultrafast">Ultrafast (lowest quality/size ratio)</option>
              <option value="veryfast">Very fast (recommended)</option>
              <option value="medium">Medium</option>
              <option value="slow">Slow (best compression)</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Resolution</span>
            <select value={scale} onChange={(e) => setScale(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5">
              <option value="source">Keep source</option>
              <option value="1080">1080p</option>
              <option value="720">720p (faster)</option>
              <option value="480">480p (fastest)</option>
            </select>
          </label>
        </div>
      </div>

      </fieldset>
      {burnError && <p role="alert" className="mt-4 break-words rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{burnError}</p>}
      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline"
          type="button"
          onClick={burn}
          disabled={busy || scanning || !video || (!subText && trackIdx === null)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
          {busy ? `Burning… ${progress}%` : "Burn subtitles"}
        </Button>
        {busy && (
          <Button variant="outline" type="button" onClick={cancel} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
            <Square className="h-4 w-4" /> Cancel
          </Button>
        )}
        {outUrl && (
          <a href={outUrl} download={outName.replace(/(?:\.mp4)?$/i, ".mp4")} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> Download MP4{outSize ? ` (${(outSize / 1024 / 1024).toFixed(1)} MB)` : ""}
          </a>
        )}
      </div>

      {busy && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
            <span>{phase || "Working…"}</span>
            <span>Elapsed {fmtTime(elapsed)}</span>
            <span>ETA {isFinite(eta) ? fmtTime(eta) : "estimating…"}</span>
            <span>Keep this tab open — rendering happens on your device.</span>
          </div>
        </div>
      )}

      {outUrl && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-ink">
          <video src={outUrl} controls className="aspect-video w-full" />
        </div>
      )}

      {log && (
        <details className="mt-4 rounded-lg border border-border bg-card/40 p-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">FFmpeg log</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">{log}</pre>
        </details>
      )}
    </AppShell>
  );
}
