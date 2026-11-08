import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload, Scissors, Type, ImageIcon, Download, Loader2, Clapperboard,
  Play, Pause, RotateCw, FlipHorizontal, Volume2, VolumeX, Gauge, Sparkles, Settings2,
  Crop, Undo2, Redo2, Layers, ArrowUp, ArrowDown, GripVertical, StepBack, StepForward, Square,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { videoOnlyArgs } from "@/lib/media-tools";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

export const Route = createFileRoute("/_authenticated/editor")({
  head: () => ({
    meta: [
      { title: "Video Editor — trim, crop, text and logo overlays | SubtitleOS" },
      { name: "description", content: "Trim and crop your clip to any shape, add text and logos with layer ordering, undo mistakes and export video or GIF with live progress." },
      { property: "og:title", content: "Video Editor — SubtitleOS" },
      { property: "og:description", content: "Trim, crop to preset shapes, drag text and image layers, undo and redo, then export with live progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorPage,
});

function fmt(t: number) {
  if (!isFinite(t)) return "00:00.0";
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

function clock(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

const FONTS = [
  { label: "Modern sans", value: "system-ui, sans-serif" },
  { label: "Classic serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Typewriter", value: "'Courier New', monospace" },
  { label: "Impact", value: "Impact, Haettenschweiler, sans-serif" },
];

const SIZES = [
  { label: "Same as original", value: 0 },
  { label: "1080p", value: 1080 },
  { label: "720p", value: 720 },
  { label: "480p", value: 480 },
];

const QUALITY = [
  { label: "High", crf: 18 },
  { label: "Balanced", crf: 22 },
  { label: "Small file", crf: 28 },
];

const RATIOS: { label: string; value: string; r: number | null }[] = [
  { label: "Free", value: "free", r: null },
  { label: "Original", value: "orig", r: 0 },
  { label: "Widescreen 16:9", value: "16:9", r: 16 / 9 },
  { label: "Vertical 9:16", value: "9:16", r: 9 / 16 },
  { label: "Square 1:1", value: "1:1", r: 1 },
  { label: "Portrait 4:5", value: "4:5", r: 4 / 5 },
  { label: "Classic 4:3", value: "4:3", r: 4 / 3 },
  { label: "Cinema 21:9", value: "21:9", r: 21 / 9 },
];

const FPS_CHOICES = [23.976, 24, 25, 29.97, 30, 50, 60];

type LayerId = "text" | "image";

type Snapshot = {
  start: number; end: number;
  text: string; font: string; textSize: number; textColor: string; outline: boolean; textX: number; textY: number;
  imgScale: number; imgOpacity: number; imgX: number; imgY: number;
  speed: number; rotate: number; flip: boolean; muted: boolean; volume: number; fadeIn: number; fadeOut: number;
  cropOn: boolean; cropX: number; cropY: number; cropW: number; cropH: number; ratio: string;
  layers: LayerId[];
  outHeight: number; crf: number; format: "mp4" | "webm" | "gif";
};

function EditorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [dims, setDims] = useState({ w: 1280, h: 720 });
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(30);

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  const [text, setText] = useState("");
  const [font, setFont] = useState(FONTS[0].value);
  const [textSize, setTextSize] = useState(6);
  const [textColor, setTextColor] = useState("#ffffff");
  const [outline, setOutline] = useState(true);
  const [textX, setTextX] = useState(50);
  const [textY, setTextY] = useState(85);

  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgScale, setImgScale] = useState(20);
  const [imgOpacity, setImgOpacity] = useState(100);
  const [imgX, setImgX] = useState(85);
  const [imgY, setImgY] = useState(12);

  const [layers, setLayers] = useState<LayerId[]>(["image", "text"]); // last = on top

  const [speed, setSpeed] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [flip, setFlip] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  // Crop (percentages of the source picture)
  const [cropOn, setCropOn] = useState(false);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(100);
  const [cropH, setCropH] = useState(100);
  const [ratio, setRatio] = useState("free");

  const [outHeight, setOutHeight] = useState(0);
  const [crf, setCrf] = useState(22);
  const [format, setFormat] = useState<"mp4" | "webm" | "gif">("mp4");

  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState("");
  const [eta, setEta] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [outSize, setOutSize] = useState(0);
  const [exportError, setExportError] = useState("");
  const [outputFormat, setOutputFormat] = useState<"mp4" | "webm" | "gif">("mp4");
  const encoderRef = useRef<FFmpeg | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<null | "text" | "image" | "crop" | "crop-size">(null);
  const dragOriginRef = useRef<{ x: number; y: number; cx: number; cy: number }>({ x: 0, y: 0, cx: 0, cy: 0 });
  const runStartRef = useRef(0);
  const dragLayerRef = useRef<LayerId | null>(null);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);
  useEffect(() => () => { abortRef.current?.abort(); encoderRef.current?.terminate(); }, []);
  useEffect(() => () => { if (outUrl) URL.revokeObjectURL(outUrl); }, [outUrl]);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = muted ? 0 : Math.min(1, volume / 100); }, [volume, muted]);

  const keptLength = Math.max(0, (end - start) / speed);
  const frame = 1 / fps;

  // ---------- Undo / redo ----------
  const snapshot = useCallback((): Snapshot => ({
    start, end, text, font, textSize, textColor, outline, textX, textY,
    imgScale, imgOpacity, imgX, imgY,
    speed, rotate, flip, muted, volume, fadeIn, fadeOut,
    cropOn, cropX, cropY, cropW, cropH, ratio,
    layers: [...layers], outHeight, crf, format,
  }), [start, end, text, font, textSize, textColor, outline, textX, textY, imgScale, imgOpacity, imgX, imgY,
    speed, rotate, flip, muted, volume, fadeIn, fadeOut, cropOn, cropX, cropY, cropW, cropH, ratio, layers, outHeight, crf, format]);

  const historyRef = useRef<Snapshot[]>([]);
  const indexRef = useRef(-1);
  const applyingRef = useRef(false);
  const [histState, setHistState] = useState({ canUndo: false, canRedo: false });

  const applySnapshot = useCallback((s: Snapshot) => {
    applyingRef.current = true;
    setStart(s.start); setEnd(s.end);
    setText(s.text); setFont(s.font); setTextSize(s.textSize); setTextColor(s.textColor);
    setOutline(s.outline); setTextX(s.textX); setTextY(s.textY);
    setImgScale(s.imgScale); setImgOpacity(s.imgOpacity); setImgX(s.imgX); setImgY(s.imgY);
    setSpeed(s.speed); setRotate(s.rotate); setFlip(s.flip); setMuted(s.muted);
    setVolume(s.volume); setFadeIn(s.fadeIn); setFadeOut(s.fadeOut);
    setCropOn(s.cropOn); setCropX(s.cropX); setCropY(s.cropY); setCropW(s.cropW); setCropH(s.cropH); setRatio(s.ratio);
    setLayers([...s.layers]); setOutHeight(s.outHeight); setCrf(s.crf); setFormat(s.format);
    // let the state flush before recording again
    setTimeout(() => { applyingRef.current = false; }, 0);
  }, []);

  // Record changes (debounced) into the history stack.
  useEffect(() => {
    const snap = snapshot();
    const t = setTimeout(() => {
      if (applyingRef.current) return;
      const cur = historyRef.current[indexRef.current];
      if (cur && JSON.stringify(cur) === JSON.stringify(snap)) return;
      historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
      historyRef.current.push(snap);
      if (historyRef.current.length > 80) historyRef.current.shift();
      indexRef.current = historyRef.current.length - 1;
      setHistState({ canUndo: indexRef.current > 0, canRedo: false });
    }, 350);
    return () => clearTimeout(t);
  }, [snapshot]);

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    applySnapshot(historyRef.current[indexRef.current]);
    setHistState({ canUndo: indexRef.current > 0, canRedo: indexRef.current < historyRef.current.length - 1 });
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    applySnapshot(historyRef.current[indexRef.current]);
    setHistState({ canUndo: indexRef.current > 0, canRedo: indexRef.current < historyRef.current.length - 1 });
  }, [applySnapshot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---------- files ----------
  function pickVideo(f: File | null) {
    if (!f || runningRef.current) return;
    if (f.size > 3 * 1024 * 1024 * 1024) { toast.error("File too large (max 3 GB)."); return; }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoRef.current?.pause();
    setDuration(0); setStart(0); setEnd(0); setCurrent(0); setPlaying(false);
    setExportError("");
    historyRef.current = []; indexRef.current = -1;
    setHistState({ canUndo: false, canRedo: false });
    setFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setOutUrl(null);
  }

  function pickImage(f: File | null) {
    if (!f) return;
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImgFile(f);
    setImgUrl(URL.createObjectURL(f));
  }

  function onMeta() {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setEnd(v.duration || 0);
    setStart(0);
    setDims({ w: v.videoWidth || 1280, h: v.videoHeight || 720 });
    setCropX(0); setCropY(0); setCropW(100); setCropH(100); setRatio("free"); setCropOn(false);
  }

  function onTime() {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (!v.paused && end > start && v.currentTime >= end) {
      v.currentTime = start;
      if (!v.paused) void v.play();
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.min(Math.max(t, 0), duration || 0);
    v.currentTime = next;
    setCurrent(next);
  }

  function snapFrame(t: number) {
    return Math.max(0, Math.round(t * fps) / fps);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { if (v.currentTime < start || v.currentTime > end) v.currentTime = start; void v.play(); }
    else v.pause();
  }

  // ---------- crop helpers ----------
  const cropPx = useMemo(() => {
    const w = Math.max(2, Math.round((cropW / 100) * dims.w / 2) * 2);
    const h = Math.max(2, Math.round((cropH / 100) * dims.h / 2) * 2);
    const x = Math.min(dims.w - w, Math.max(0, Math.round((cropX / 100) * dims.w / 2) * 2));
    const y = Math.min(dims.h - h, Math.max(0, Math.round((cropY / 100) * dims.h / 2) * 2));
    return { w, h, x, y };
  }, [cropW, cropH, cropX, cropY, dims]);

  const applyRatio = useCallback((value: string) => {
    setRatio(value);
    const preset = RATIOS.find((r) => r.value === value);
    if (!preset || preset.r === null) return;
    setCropOn(true);
    const target = preset.r === 0 ? dims.w / dims.h : preset.r;
    const srcRatio = dims.w / dims.h;
    let wPct = 100, hPct = 100;
    if (target > srcRatio) hPct = (srcRatio / target) * 100;
    else wPct = (target / srcRatio) * 100;
    setCropW(wPct); setCropH(hPct);
    setCropX((100 - wPct) / 2); setCropY((100 - hPct) / 2);
  }, [dims]);

  const onDragMove = useCallback((e: PointerEvent) => {
    const which = dragRef.current;
    const box = stageRef.current?.getBoundingClientRect();
    if (!which || !box) return;
    const xPct = Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100));
    const yPct = Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100));
    if (which === "text") { setTextX(Math.round(xPct)); setTextY(Math.round(yPct)); }
    else if (which === "image") { setImgX(Math.round(xPct)); setImgY(Math.round(yPct)); }
    else if (which === "crop") {
      const o = dragOriginRef.current;
      const dx = ((e.clientX - o.x) / box.width) * 100;
      const dy = ((e.clientY - o.y) / box.height) * 100;
      setCropX(Math.min(100 - cropW, Math.max(0, o.cx + dx)));
      setCropY(Math.min(100 - cropH, Math.max(0, o.cy + dy)));
    } else if (which === "crop-size") {
      const preset = RATIOS.find((r) => r.value === ratio);
      const lock = preset && preset.r !== null ? (preset.r === 0 ? dims.w / dims.h : preset.r) : null;
      let w = Math.min(100 - cropX, Math.max(5, xPct - cropX));
      let h = Math.min(100 - cropY, Math.max(5, yPct - cropY));
      if (lock) {
        const wPx = (w / 100) * dims.w;
        const hPx = wPx / lock;
        h = Math.min(100 - cropY, (hPx / dims.h) * 100);
        w = ((h / 100) * dims.h * lock / dims.w) * 100;
      }
      setCropW(w); setCropH(h);
    }
  }, [cropW, cropH, cropX, cropY, ratio, dims]);

  useEffect(() => {
    const up = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", onDragMove); window.removeEventListener("pointerup", up); };
  }, [onDragMove]);

  // ---------- overlay ----------
  async function buildOverlayPng(): Promise<Uint8Array | null> {
    if (!text.trim() && !imgFile) return null;
    const canvas = document.createElement("canvas");
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const drawImage = async () => {
      if (!imgFile) return;
      const bmp = await createImageBitmap(imgFile);
      const w = (imgScale / 100) * dims.w;
      const h = (w / bmp.width) * bmp.height;
      ctx.globalAlpha = imgOpacity / 100;
      ctx.drawImage(bmp, (imgX / 100) * dims.w - w / 2, (imgY / 100) * dims.h - h / 2, w, h);
      ctx.globalAlpha = 1;
    };

    const drawText = () => {
      if (!text.trim()) return;
      const px = Math.round((textSize / 100) * dims.h);
      ctx.font = `700 ${px}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const x = (textX / 100) * dims.w;
      const y = (textY / 100) * dims.h;
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        const ly = y + (i - (lines.length - 1) / 2) * px * 1.2;
        if (outline) {
          ctx.lineWidth = Math.max(2, px * 0.08);
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.lineJoin = "round";
          ctx.strokeText(line, x, ly);
        }
        ctx.fillStyle = textColor;
        ctx.fillText(line, x, ly);
      });
    };

    for (const layer of layers) {
      if (layer === "image") await drawImage();
      else drawText();
    }

    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b as Blob), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  }

  const filterSummary = useMemo(() => {
    const bits: string[] = [];
    if (end - start < duration - 0.05) bits.push("trimmed");
    if (cropOn) bits.push(`cropped ${cropPx.w}×${cropPx.h}`);
    if (text.trim()) bits.push("text");
    if (imgFile) bits.push("picture");
    if (speed !== 1) bits.push(`${speed}× speed`);
    if (rotate) bits.push(`${rotate}° turn`);
    if (flip) bits.push("mirrored");
    if (muted) bits.push("no sound");
    if (fadeIn || fadeOut) bits.push("fades");
    return bits.length ? bits.join(" · ") : "no changes yet";
  }, [start, end, duration, text, imgFile, speed, rotate, flip, muted, fadeIn, fadeOut, cropOn, cropPx]);

  function moveLayer(id: LayerId, dir: -1 | 1) {
    setLayers((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      next[i] = prev[j]; next[j] = prev[i];
      return next;
    });
  }

  function dropLayer(target: LayerId) {
    const src = dragLayerRef.current;
    dragLayerRef.current = null;
    if (!src || src === target) return;
    setLayers((prev) => {
      const next = prev.filter((l) => l !== src);
      next.splice(next.indexOf(target), 0, src);
      return next;
    });
  }

  function cancelExport() {
    abortRef.current?.abort();
    encoderRef.current?.terminate();
    setStage("Cancelling…");
  }

  async function exportVideo() {
    if (runningRef.current) return;
    if (!file) { toast.error("Upload a video first."); return; }
    if (!duration || !Number.isFinite(duration)) { toast.error("Wait for a playable video to load first."); return; }
    if (end <= start) { toast.error("The end point must be after the start point."); return; }
    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setExportError(""); setOutUrl(null);
    videoRef.current?.pause();
    setBusy(true); setPct(0); setEta(null); setElapsed(0); setStage("Preparing…");
    runStartRef.current = Date.now();
    const ticker = window.setInterval(() => setElapsed((Date.now() - runStartRef.current) / 1000), 500);
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile } = await import("@ffmpeg/util");
      const { initializeEncoder, runEncoder } = await import("@/lib/browser-encoder");
      const ff = new FFmpeg();
      encoderRef.current = ff;
      if (controller.signal.aborted) throw new Error("Cancelled");
      ff.on("progress", ({ progress }) => {
        if (controller.signal.aborted) return;
        const p = Math.min(0.99, Math.max(0, progress));
        setPct(Math.round(p * 100));
        const spent = (Date.now() - runStartRef.current) / 1000;
        setEta(p > 0.02 ? Math.max(0, spent / p - spent) : null);
      });
      setStage("Loading the video engine…");
      await initializeEncoder(ff, controller.signal);

      const inExt = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4").toLowerCase();
      setStage("Reading your file…");
      await ff.writeFile(`in${inExt}`, await fetchFile(file));

      const overlay = await buildOverlayPng();
      if (overlay) await ff.writeFile("ov.png", overlay);

      const vf: string[] = [];
      if (cropOn) vf.push(`crop=${cropPx.w}:${cropPx.h}:${cropPx.x}:${cropPx.y}`);
      if (speed !== 1) vf.push(`setpts=${(1 / speed).toFixed(5)}*PTS`);
      if (rotate === 90) vf.push("transpose=1");
      if (rotate === 180) vf.push("transpose=1,transpose=1");
      if (rotate === 270) vf.push("transpose=2");
      if (flip) vf.push("hflip");
      if (outHeight) vf.push(`scale=-2:${outHeight}`);
      if (format === "gif") vf.push("fps=12", "scale=480:-2:flags=lanczos");
      const outDur = keptLength;
      if (fadeIn > 0) vf.push(`fade=t=in:st=0:d=${fadeIn}`);
      if (fadeOut > 0) vf.push(`fade=t=out:st=${Math.max(0, outDur - fadeOut).toFixed(3)}:d=${fadeOut}`);

      vf.push("scale=trunc(iw/2)*2:trunc(ih/2)*2", "setsar=1");
      const vChain = vf.length ? vf.join(",") : "null";
      const graph: string[] = [];
      graph.push(overlay ? `[0:v][1:v]overlay=0:0,${vChain}[v]` : `[0:v]${vChain}[v]`);

      const wantsAudio = format !== "gif" && !muted;
      if (wantsAudio) {
        const af: string[] = [];
        if (speed !== 1) {
          let s = speed;
          while (s > 2) { af.push("atempo=2"); s /= 2; }
          while (s < 0.5) { af.push("atempo=0.5"); s *= 2; }
          af.push(`atempo=${s.toFixed(4)}`);
        }
        if (volume !== 100) af.push(`volume=${(volume / 100).toFixed(2)}`);
        if (fadeIn > 0) af.push(`afade=t=in:st=0:d=${fadeIn}`);
        if (fadeOut > 0) af.push(`afade=t=out:st=${Math.max(0, outDur - fadeOut).toFixed(3)}:d=${fadeOut}`);
        graph.push(`[0:a]${af.length ? af.join(",") : "anull"}[a]`);
      }

      const outName = `out.${format}`;
      const args: string[] = ["-ss", String(snapFrame(start)), "-to", String(snapFrame(end)), "-i", `in${inExt}`];
      if (overlay) args.push("-i", "ov.png");
      args.push("-filter_complex", graph.join(";"), "-map", "[v]");
      if (wantsAudio) args.push("-map", "[a]");

      if (format === "gif") {
        args.push("-loop", "0");
      } else if (format === "webm") {
        args.push("-c:v", "libvpx-vp9", "-b:v", "0", "-crf", String(crf));
        if (wantsAudio) args.push("-c:a", "libopus", "-b:a", "128k");
      } else {
        args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p");
        if (wantsAudio) args.push("-c:a", "aac", "-b:a", "192k");
        args.push("-movflags", "+faststart");
      }
      args.push("-y", outName);

      setStage("Building your video…");
      try {
        await runEncoder(ff, args);
      } catch (error) {
        if (controller.signal.aborted) throw new Error("Cancelled");
        if (!wantsAudio) throw error;
        setStage("Checking for a video-only source…");
        setPct(0);
        await runEncoder(ff, videoOnlyArgs(args, graph[0]));
        toast.message("This export has no audio track.");
      }
      if (controller.signal.aborted) throw new Error("Cancelled");

      const data = await ff.readFile(outName);
      const mime = format === "gif" ? "image/gif" : format === "webm" ? "video/webm" : "video/mp4";
      const blob = new Blob([data as unknown as BlobPart], { type: mime });
      if (!blob.size) throw new Error("The encoder produced an empty file.");
      setOutputFormat(format);
      setOutUrl(URL.createObjectURL(blob));
      setOutSize(blob.size);
      setPct(100); setEta(0);
      toast.success(`Ready in ${clock((Date.now() - runStartRef.current) / 1000)}.`);
    } catch (e: unknown) {
      if (controller.signal.aborted) toast.message("Export cancelled.");
      else {
        const message = e instanceof Error ? e.message : String(e);
        setExportError(message);
        toast.error(`Export failed: ${message}`);
      }
    } finally {
      window.clearInterval(ticker);
      encoderRef.current?.terminate();
      encoderRef.current = null; abortRef.current = null; runningRef.current = false;
      setBusy(false);
      setStage("");
    }
  }

  const layerLabel: Record<LayerId, string> = { text: "Text", image: "Picture or logo" };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Clapperboard className="h-6 w-6 text-primary" /> Video Editor
            </h1>
            <p className="text-sm text-muted-foreground">
              Trim, crop to any shape, add text and pictures, then save as video or GIF. Everything happens on your device.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" aria-label="Undo" title="Undo" onClick={undo} disabled={busy || !histState.canUndo}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/40 disabled:opacity-40">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" aria-label="Redo" title="Redo" onClick={redo} disabled={busy || !histState.canRedo}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/40 disabled:opacity-40">
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <fieldset disabled={busy} className="min-w-0 space-y-4 border-0 p-0">
        <section className="border-t border-border py-5">
          <h2 className="mb-3 text-sm font-medium">1 · Your video</h2>
          <label
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm hover:bg-accent/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickVideo(e.dataTransfer.files?.[0] ?? null); }}
          >
            <Upload className="h-5 w-5 text-primary" />
            <span className="min-w-0 break-words">{file ? file.name : "Choose or drop a video (MP4, MOV, WebM — up to 3 GB)"}</span>
            <input type="file" accept="video/*" className="hidden" onChange={(e) => pickVideo(e.target.files?.[0] ?? null)} />
          </label>

          {videoUrl && (
            <>
              <div ref={stageRef} className="relative mt-4 overflow-hidden rounded-lg bg-ink" style={{ containerType: "size", aspectRatio: `${dims.w} / ${dims.h}` }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  playsInline
                  preload="metadata"
                  onError={() => setExportError("This video cannot be previewed by your browser. Try an MP4 with H.264 video.")}
                  onLoadedMetadata={onMeta}
                  onTimeUpdate={onTime}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  className="h-full w-full select-none object-contain"
                  style={{
                    transform: `rotate(${rotate}deg) scaleX(${flip ? -1 : 1})`,
                    transition: "transform 150ms ease",
                  }}
                />
                {layers.map((layer, i) => {
                  const z = 10 + i;
                  if (layer === "image") {
                    return imgUrl ? (
                      <img
                        key="image"
                        src={imgUrl}
                        alt="Overlay preview"
                        onPointerDown={() => { dragRef.current = "image"; }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move touch-none"
                        style={{ left: `${imgX}%`, top: `${imgY}%`, width: `${imgScale}%`, opacity: imgOpacity / 100, zIndex: z }}
                      />
                    ) : null;
                  }
                  return text.trim() ? (
                    <span
                      key="text"
                      onPointerDown={() => { dragRef.current = "text"; }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move whitespace-pre text-center font-bold leading-tight touch-none"
                      style={{
                        left: `${textX}%`, top: `${textY}%`, color: textColor, fontFamily: font,
                        fontSize: `${textSize}cqh`, zIndex: z,
                        textShadow: outline ? "0 2px 6px rgba(0,0,0,.9), 0 0 3px rgba(0,0,0,.9)" : "none",
                      }}
                    >
                      {text}
                    </span>
                  ) : null;
                })}

                {cropOn && (
                  <div
                    onPointerDown={(e) => {
                      dragRef.current = "crop";
                      dragOriginRef.current = { x: e.clientX, y: e.clientY, cx: cropX, cy: cropY };
                    }}
                    className="absolute cursor-move touch-none border-2 border-primary"
                    style={{
                      left: `${cropX}%`, top: `${cropY}%`, width: `${cropW}%`, height: `${cropH}%`,
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", zIndex: 30,
                    }}
                  >
                    <span
                      onPointerDown={(e) => { e.stopPropagation(); dragRef.current = "crop-size"; }}
                      className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize touch-none rounded-sm border-2 border-primary bg-background"
                    />
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={togglePlay} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/40">
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? "Pause" : "Play trim"}
                </Button>
                <input
                  aria-label="Video position" type="range" min={0} max={Math.max(duration, 0.1)} step={frame} value={current}
                  onChange={(e) => seek(Number(e.target.value))} className="min-w-24 flex-1 accent-primary"
                />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(current)} / {fmt(duration)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" aria-label="Previous frame" title="Previous frame" onClick={() => { videoRef.current?.pause(); seek(snapFrame(current - frame)); }}><StepBack /></Button>
                <Button variant="outline" size="icon" aria-label="Next frame" title="Next frame" onClick={() => { videoRef.current?.pause(); seek(snapFrame(current + frame)); }}><StepForward /></Button>
                <span className="text-xs tabular-nums text-muted-foreground">Frame {Math.round(current * fps)} · {dims.w} × {dims.h} · {fmt(keptLength)} kept</span>
              </div>
            </>
          )}
        </section>

        <section className="border-t border-border py-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Scissors className="h-4 w-4" /> 2 · Trim</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Range label="Start" value={start} min={0} max={Math.max(duration, 0.1)} step={frame}
              onChange={(v) => { const nv = snapFrame(Math.min(v, end - frame)); setStart(nv); seek(nv); }} format={fmt} />
            <Range label="End" value={end} min={0} max={Math.max(duration, 0.1)} step={frame}
              onChange={(v) => { const nv = snapFrame(Math.max(v, start + frame)); setEnd(nv); seek(nv); }} format={fmt} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Button variant="outline" onClick={() => { const nv = snapFrame(Math.min(current, end - frame)); setStart(nv); }} className="rounded-md border border-border px-2 py-1 hover:bg-accent/40">Start here</Button>
            <Button variant="outline" onClick={() => { const nv = snapFrame(Math.max(current, start + frame)); setEnd(nv); }} className="rounded-md border border-border px-2 py-1 hover:bg-accent/40">End here</Button>
            <Button variant="outline" onClick={() => { setStart(0); setEnd(snapFrame(duration)); }} className="rounded-md border border-border px-2 py-1 hover:bg-accent/40">Whole clip</Button>
            <Button variant="outline" onClick={() => { const nv = snapFrame(Math.max(0, start - frame)); setStart(nv); seek(nv); }} className="rounded-md border border-border px-2 py-1 hover:bg-accent/40">Start −1 frame</Button>
            <Button variant="outline" onClick={() => { const nv = snapFrame(Math.min(end - frame, start + frame)); setStart(nv); seek(nv); }} className="rounded-md border border-border px-2 py-1 hover:bg-accent/40">Start +1 frame</Button>
            <Button variant="outline" onClick={() => { const nv = snapFrame(Math.max(start + frame, end - frame)); setEnd(nv); seek(nv); }} className="rounded-md border border-border px-2 py-1 hover:bg-accent/40">End −1 frame</Button>
            <Button variant="outline" onClick={() => { const nv = snapFrame(Math.min(duration, end + frame)); setEnd(nv); seek(nv); }} className="rounded-md border border-border px-2 py-1 hover:bg-accent/40">End +1 frame</Button>
            <label className="ml-auto flex items-center gap-1 text-muted-foreground">
              Frames per second
              <select value={fps} onChange={(e) => setFps(Number(e.target.value))} className="h-7 rounded-md border border-border bg-background px-1">
                {FPS_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Kept length: {fmt(keptLength)}</p>
        </section>

        <section className="border-t border-border py-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Crop className="h-4 w-4" /> 3 · Crop and shape</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cropOn} onChange={(e) => setCropOn(e.target.checked)} className="h-4 w-4 accent-primary" />
              <span className="text-muted-foreground">Crop the picture</span>
            </label>
            {RATIOS.map((r) => (
              <Button variant="outline" key={r.value} onClick={() => applyRatio(r.value)}
                className={`rounded-md border px-2 py-1 text-xs ${ratio === r.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent/40"}`}>
                {r.label}
              </Button>
            ))}
          </div>
          {cropOn && (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <Range label="Left" value={cropX} min={0} max={Math.max(0, 100 - cropW)} step={0.5} onChange={setCropX} format={(v) => `${Math.round((v / 100) * dims.w)} px`} />
                <Range label="Top" value={cropY} min={0} max={Math.max(0, 100 - cropH)} step={0.5} onChange={setCropY} format={(v) => `${Math.round((v / 100) * dims.h)} px`} />
                <Range label="Width" value={cropW} min={5} max={100 - cropX} step={0.5} onChange={(v) => { setCropW(v); setRatio("free"); }} format={(v) => `${Math.round((v / 100) * dims.w)} px`} />
                <Range label="Height" value={cropH} min={5} max={100 - cropY} step={0.5} onChange={(v) => { setCropH(v); setRatio("free"); }} format={(v) => `${Math.round((v / 100) * dims.h)} px`} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Exact cut: {cropPx.w} × {cropPx.h} pixels, starting {cropPx.x} px from the left and {cropPx.y} px from the top (original {dims.w} × {dims.h}).
              </p>
            </>
          )}
        </section>

        <section className="border-t border-border py-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Type className="h-4 w-4" /> 4 · Text</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Type the words to show on the video (press Enter for a second line)"
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Style</span>
              <select value={font} onChange={(e) => setFont(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <Range label="Size" value={textSize} min={2} max={20} step={0.5} onChange={setTextSize} format={(v) => `${v}%`} />
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Colour</span>
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background" />
            </label>
            <label className="flex items-end gap-2 text-sm">
              <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} className="h-4 w-4 accent-primary" />
              <span className="pb-2 text-muted-foreground">Dark outline</span>
            </label>
          </div>
        </section>

        <section className="border-t border-border py-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><ImageIcon className="h-4 w-4" /> 5 · Picture or logo</h2>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-3 text-sm hover:bg-accent/40">
            <Upload className="h-4 w-4 text-primary" />
            <span>{imgFile ? imgFile.name : "Choose a PNG or JPG"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
          </label>
          {imgUrl && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Range label="Size" value={imgScale} min={5} max={100} step={1} onChange={setImgScale} format={(v) => `${v}%`} />
              <Range label="See-through" value={imgOpacity} min={10} max={100} step={5} onChange={setImgOpacity} format={(v) => `${v}%`} />
              <Button variant="outline" onClick={() => { setImgFile(null); if (imgUrl) URL.revokeObjectURL(imgUrl); setImgUrl(null); }}
                className="self-end rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/40">Remove picture</Button>
            </div>
          )}
        </section>

        <section className="border-t border-border py-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-medium"><Layers className="h-4 w-4" /> 6 · What sits on top</h2>
          <p className="mb-3 text-xs text-muted-foreground">Drag to reorder — the top item in this list is drawn above the other.</p>
          <ul className="space-y-2">
            {[...layers].reverse().map((id) => (
              <li
                key={id}
                draggable
                onDragStart={() => { dragLayerRef.current = id; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropLayer(id)}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                <span>{layerLabel[id]}</span>
                <span className="ml-auto flex items-center gap-1">
                  <Button variant="outline" onClick={() => moveLayer(id, 1)} className="rounded border border-border p-1 hover:bg-accent/40" aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" onClick={() => moveLayer(id, -1)} className="rounded border border-border p-1 hover:bg-accent/40" aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border py-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4" /> 7 · Look and sound</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 flex items-center gap-1 text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> Speed</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => <option key={s} value={s}>{s}×</option>)}
              </select>
            </label>
            <Button variant="outline" onClick={() => setRotate((r) => (r + 90) % 360)}
              className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border text-sm hover:bg-accent/40">
              <RotateCw className="h-4 w-4" /> Turn {rotate}°
            </Button>
            <Button variant="outline" onClick={() => setFlip((f) => !f)}
              className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border text-sm hover:bg-accent/40">
              <FlipHorizontal className="h-4 w-4" /> {flip ? "Mirrored" : "Mirror"}
            </Button>
            <Button variant="outline" onClick={() => setMuted((m) => !m)}
              className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border text-sm hover:bg-accent/40">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {muted ? "Silent" : "Sound on"}
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Range label="Volume" value={volume} min={0} max={200} step={5} onChange={setVolume} format={(v) => `${v}%`} />
            <Range label="Fade in" value={fadeIn} min={0} max={5} step={0.25} onChange={setFadeIn} format={(v) => `${v}s`} />
            <Range label="Fade out" value={fadeOut} min={0} max={5} step={0.25} onChange={setFadeOut} format={(v) => `${v}s`} />
          </div>
        </section>

        <section className="border-t border-border py-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Settings2 className="h-4 w-4" /> 8 · Save</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">File type</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as any)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="mp4">Video (MP4)</option>
                <option value="webm">Video (WebM)</option>
                <option value="gif">Animated GIF</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Picture size</span>
              <select value={outHeight} onChange={(e) => setOutHeight(Number(e.target.value))} disabled={format === "gif"}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50">
                {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Quality</span>
              <select value={crf} onChange={(e) => setCrf(Number(e.target.value))} disabled={format === "gif"}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50">
                {QUALITY.map((q) => <option key={q.crf} value={q.crf}>{q.label}</option>)}
              </select>
            </label>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">Changes: {filterSummary}</p>

        </section>
        </fieldset>
        <section className="border-t border-border py-5">
          {exportError && <p role="alert" className="mt-3 break-words rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{exportError}</p>}
          <Button onClick={exportVideo} disabled={!file || !duration || busy}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? `${stage || "Working"} ${pct}%` : `Export ${format.toUpperCase()}`}
          </Button>

          {busy && (
            <div className="mt-3 space-y-2">
              <Button variant="outline" onClick={cancelExport}><Square /> Cancel export</Button>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                {pct}% done · {clock(elapsed)} so far · {eta === null ? "working out the time left…" : `about ${clock(eta)} left`}
              </p>
            </div>
          )}

          {outUrl && (
            <div className="mt-4 space-y-2">
              {outputFormat === "gif"
                ? <img src={outUrl} alt="Exported result" className="w-full rounded-lg bg-ink" />
                : <video src={outUrl} controls className="w-full rounded-lg bg-ink" />}
              <a href={outUrl} download={`${file?.name.replace(/\.[^.]+$/, "") || "edited"}.edited.${outputFormat}`} className="inline-flex items-center gap-2 text-sm text-primary underline">
                <Download className="h-4 w-4" /> Download {outputFormat.toUpperCase()} ({(outSize / 1024 / 1024).toFixed(1)} MB)
              </a>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Range({ label, value, onChange, min, max, step, format }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 flex items-center justify-between text-muted-foreground">
        <span>{label}</span><span className="tabular-nums">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </label>
  );
}
