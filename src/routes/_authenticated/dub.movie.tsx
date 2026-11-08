import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Upload, Mic, Loader2, Download, Film, Square, Play, Volume2, Wand2, ChevronLeft, ChevronRight,
  ScanFace, Pause, Trash2, X, AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { initializeEncoder, runEncoder } from "@/lib/browser-encoder";
import { dubAudioFilter, mediaExtension } from "@/lib/dubbing-workflow";
import { alignDubToVideo, buildAlignedDub, detectFps } from "@/lib/lip-align";
import { trackMouth, alignDubToMouth, mouthAt, type MouthTrack } from "@/lib/mouth-track";
import { startLipSync, pollLipSync, createLipSyncUpload } from "@/lib/dub.functions";
import { supabase } from "@/lib/supabase-safe";
import { getUserSyncSoKey } from "@/lib/user-connectors";

export const Route = createFileRoute("/_authenticated/dub/movie")({
  head: () => ({
    meta: [
      { title: "Movie Dubbing — layer your voice over a video | SubtitleOS" },
      { name: "description", content: "Upload a movie clip, record your own voice while it plays, preview the dub live over the video, and lip-sync it." },
      { property: "og:title", content: "Movie Dubbing — SubtitleOS" },
      { property: "og:description", content: "Dub any video with your own voice, with live preview and lip-sync." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MovieDubPage,
});

type VoiceFx = "natural" | "warm" | "deep" | "radio" | "echo" | "bright";
type Take = { id: string; url: string; b64: string; mime: string; dur: number; fx: VoiceFx; startAt: number; endAt: number };
const FX_LABEL: Record<VoiceFx, string> = {
  natural: "Natural", warm: "Warm", deep: "Deep", radio: "Radio", echo: "Hall echo", bright: "Bright",
};

function buildEffect(ctx: AudioContext, src: AudioNode, fx: VoiceFx): AudioNode {
  const f = (type: BiquadFilterType, freq: number, gain = 0, q = 1) => {
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.gain.value = gain; n.Q.value = q; return n;
  };
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24; comp.ratio.value = 3;
  let last: AudioNode = src;
  const chain = (...nodes: AudioNode[]) => { for (const n of nodes) { last.connect(n); last = n; } };
  if (fx === "warm") chain(f("lowshelf", 250, 5), f("highshelf", 6000, -3));
  if (fx === "deep") chain(f("lowshelf", 180, 8), f("peaking", 1200, -4), f("lowpass", 5000));
  if (fx === "radio") chain(f("highpass", 400), f("lowpass", 3200), f("peaking", 1500, 6));
  if (fx === "bright") chain(f("highshelf", 4000, 6), f("highpass", 90));
  if (fx === "echo") {
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.18;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const mix = ctx.createGain();
    last.connect(mix); last.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(mix);
    last = mix;
  }
  chain(comp);
  return last;
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = String(r.result);
      const c = s.indexOf(",");
      resolve(c >= 0 ? s.slice(c + 1) : s);
    };
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(b);
  });
}
function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function MovieDubPage() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [dubUrl, setDubUrl] = useState<string | null>(null);
  const [dubB64, setDubB64] = useState("");
  const [dubMime, setDubMime] = useState("audio/mpeg");

  // Mouth-shape tracking
  const [mouth, setMouth] = useState<MouthTrack | null>(null);
  const [mouthBusy, setMouthBusy] = useState(false);
  const [mouthPct, setMouthPct] = useState(0);
  const [mouthLevel, setMouthLevel] = useState(0);

  // Layering / live preview
  const [originalVol, setOriginalVol] = useState(0.15);
  const [dubVol, setDubVol] = useState(1);
  const [offset, setOffset] = useState(0); // seconds, dub delay relative to video

  // Frame-accurate alignment
  const [fps, setFps] = useState(25);
  const [aligning, setAligning] = useState(false);
  const [alignNote, setAlignNote] = useState("");

  // Own-voice recording
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [voiceFx, setVoiceFx] = useState<VoiceFx>("natural");
  const [monitorOn, setMonitorOn] = useState(false);
  const [cleanMic, setCleanMic] = useState(true);
  const [fromHere, setFromHere] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recElapsed, setRecElapsed] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [activeTake, setActiveTake] = useState<string | null>(null);
  const [takeEnd, setTakeEnd] = useState<number | null>(null); // video time where the active take stops
  const recEndRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const meterRaf = useRef<number | null>(null);
  const elapsedTimer = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const disposedRef = useRef(false);
  const takeUrlsRef = useRef(new Set<string>());

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [operationError, setOperationError] = useState("");
  const [preparingRecording, setPreparingRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const encoderRef = useRef<import("@ffmpeg/ffmpeg").FFmpeg | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const recordingPending = useRef(false);

  // Lip sync
  const [lipBusy, setLipBusy] = useState(false);
  const [lipStatus, setLipStatus] = useState("");
  const [lipUrl, setLipUrl] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const runUpload = useServerFn(createLipSyncUpload);
  const runStartLip = useServerFn(startLipSync);
  const runPollLip = useServerFn(pollLipSync);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => () => { if (exportUrl) URL.revokeObjectURL(exportUrl); }, [exportUrl]);
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      exportAbort.current?.abort();
      encoderRef.current?.terminate();
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (meterRaf.current != null) cancelAnimationFrame(meterRaf.current);
      if (elapsedTimer.current != null) clearInterval(elapsedTimer.current);
      void audioCtxRef.current?.close().catch(() => {});
      takeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      takeUrlsRef.current.clear();
    };
  }, []);

  // Keep the dub track glued to the video timeline.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const a = () => audioRef.current;
    const seekAudio = () => {
      const el = a();
      if (!el) return;
      // The dub ends exactly where its take stopped on the video timeline.
      if (v.currentTime < offset || (takeEnd != null && v.currentTime >= takeEnd - 1e-3)) { el.pause(); return; }
      const t = Math.max(0, v.currentTime - offset);
      if (Math.abs(el.currentTime - t) > 0.15) el.currentTime = t;
      // Seeked back inside the take while the video is still playing (e.g. a
      // second Preview click) — the video's play event won't fire again, so
      // resume the dub here.
      if (!v.paused && el.paused) void el.play().catch(() => {});
    };
    const onPlay = () => { const el = a(); if (!el) return; el.playbackRate = v.playbackRate; seekAudio(); };
    const onPause = () => { a()?.pause(); };
    const onRate = () => { const el = a(); if (el) el.playbackRate = v.playbackRate; };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeking", seekAudio);
    v.addEventListener("seeked", seekAudio);
    v.addEventListener("timeupdate", seekAudio);
    v.addEventListener("ratechange", onRate);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeking", seekAudio);
      v.removeEventListener("seeked", seekAudio);
      v.removeEventListener("timeupdate", seekAudio);
      v.removeEventListener("ratechange", onRate);
    };
  }, [dubUrl, offset, takeEnd, videoUrl]);

  useEffect(() => { if (videoRef.current) videoRef.current.volume = originalVol; }, [originalVol, videoUrl]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = dubVol; }, [dubVol, dubUrl]);

  // Live mouth-openness meter while the preview plays.
  useEffect(() => {
    if (!mouth) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setMouthLevel(mouthAt(mouth, v.currentTime));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mouth]);

  // Work out the video's real frame rate so timing can snap to whole frames.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl) return;
    let cancelled = false;
    let measuring = false;
    const run = () => {
      if (measuring || cancelled) return;
      measuring = true;
      void detectFps(v).then(f => { if (!cancelled) setFps(f); });
    };
    setFps(25);
    v.addEventListener("play", run);
    return () => { cancelled = true; v.removeEventListener("play", run); };
  }, [videoUrl]);

  const locked = recording || preparingRecording || exporting || lipBusy || mouthBusy || aligning;
  const frameStep = 1 / (fps || 25);
  const offsetFrames = Math.round(offset / frameStep);

  function nudgeFrames(n: number) {
    setOffset((o) => Math.max(-5, Math.min(videoRef.current?.duration || 5, (Math.round(o / frameStep) + n) * frameStep)));
  }

  /** Cross-correlate the recorded dub with the movie's own audio and snap to a frame. */
  async function autoAlign() {
    if (!file || !dubB64) { toast.error("Upload a video and record a take first."); return; }
    setAligning(true); setAlignNote("");
    try {
      const res = await alignDubToVideo(file, base64ToBlob(dubB64, dubMime), fps || 25);
      setOffset(res.offsetSeconds);
      const pct = Math.round(res.confidence * 100);
      setAlignNote(
        `Matched at ${res.offsetFrames >= 0 ? "+" : ""}${res.offsetFrames} frame${Math.abs(res.offsetFrames) === 1 ? "" : "s"} (${res.offsetSeconds.toFixed(3)}s) at ${res.fps} fps · match strength ${pct}%`,
      );
      toast.success(pct >= 25 ? "Timing aligned to the video." : "Aligned — the match was weak, check it by ear.");
    } catch (e: any) {
      toast.error(`Could not align: ${e?.message ?? e}`);
    } finally {
      setAligning(false);
    }
  }

  /** Scan the video's face and measure how open the mouth is on every frame. */
  async function scanMouth() {
    if (!videoUrl) { toast.error("Upload a video first."); return; }
    setMouthBusy(true); setMouthPct(0);
    try {
      const t = await trackMouth(videoUrl, { sampleFps: Math.min(15, fps || 15), onProgress: (p) => setMouthPct(Math.round(p * 100)) });
      setMouth(t);
      if (t.faceCoverage < 0.2) toast.warning("A face was only visible in part of the clip — matching may be rough.");
      else toast.success("Mouth movements tracked.");
    } catch (e: any) {
      toast.error(`Mouth tracking failed: ${e?.message ?? e}`);
    } finally {
      setMouthBusy(false);
    }
  }

  /** Align the dub to the tracked mouth movements, frame by frame. */
  async function alignToMouth() {
    if (!mouth || !dubB64) { toast.error("Track the mouth and make a dub track first."); return; }
    setAligning(true); setAlignNote("");
    try {
      const res = await alignDubToMouth(mouth, base64ToBlob(dubB64, dubMime), fps || 25);
      setOffset(res.offsetSeconds);
      const pct = Math.round(res.confidence * 100);
      setAlignNote(
        `Lips matched at ${res.offsetFrames >= 0 ? "+" : ""}${res.offsetFrames} frame${Math.abs(res.offsetFrames) === 1 ? "" : "s"} (${res.offsetSeconds.toFixed(3)}s) at ${res.fps} fps · match strength ${pct}% · face seen in ${Math.round(res.faceCoverage * 100)}% of frames`,
      );
      toast.success("Timing matched to the mouth movements.");
    } catch (e: any) {
      toast.error(`Could not match the lips: ${e?.message ?? e}`);
    } finally {
      setAligning(false);
    }
  }

  function pickFile(f: File | null) {
    if (!f || locked) return;
    if (!(f.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name))) { setOperationError("Choose a video file."); return; }
    if (f.size > 3 * 1024 * 1024 * 1024) { toast.error("File too large (max 3 GB)."); return; }
    takeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    takeUrlsRef.current.clear();
    setTakes([]); setActiveTake(null); setTakeEnd(null); setOffset(0); setAlignNote(""); setOperationError("");
    setFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setDubUrl(null); setDubB64(""); setExportUrl(null); setLipUrl(""); setMouth(null);
  }

  async function startRecording() {
    if (!videoRef.current || locked || recordingPending.current) return;
    recordingPending.current = true; setPreparingRecording(true); setOperationError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: cleanMic, echoCancellation: cleanMic, autoGainControl: cleanMic },
      });
      if (disposedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      micStreamRef.current = stream;
      // Live voice chain: mic -> effect -> (monitor speakers) + (recorder) + (level meter)
      const ctx = new AudioContext();
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const out = ctx.createMediaStreamDestination();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const monitor = ctx.createGain();
      monitor.gain.value = monitorOn ? 1 : 0;
      monitorGainRef.current = monitor;
      const last = buildEffect(ctx, src, voiceFx);
      last.connect(out); last.connect(analyser); last.connect(monitor); monitor.connect(ctx.destination);
      audioCtxRef.current = ctx;
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0; for (const b of buf) peak = Math.max(peak, Math.abs(b - 128));
        setMicLevel(Math.min(1, peak / 100));
        meterRaf.current = requestAnimationFrame(tick);
      };
      tick();

      // Countdown
      const v = videoRef.current;
      // Snap the start point to a whole video frame so lips line up exactly.
      const startAt = Math.round((fromHere ? v.currentTime : 0) * fps) / fps;
      v.pause(); v.currentTime = startAt;
      for (let n = 3; n > 0; n--) {
        if (disposedRef.current) return;
        setCountdown(n); await new Promise((r) => setTimeout(r, 700));
      }
      if (disposedRef.current) return;
      setCountdown(0);

      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const rec = new MediaRecorder(out.stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      const recStart = performance.now();
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (meterRaf.current) cancelAnimationFrame(meterRaf.current);
        setMicLevel(0);
        void ctx.close();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) { setOperationError("No audio was captured. Record another take."); return; }
        const b64 = await blobToBase64(blob);
        if (disposedRef.current) return;
        const take: Take = {
          id: crypto.randomUUID(), url: URL.createObjectURL(blob), b64, mime: blob.type,
          dur: (performance.now() - recStart) / 1000, fx: voiceFx, startAt, endAt: recEndRef.current,
        };
        takeUrlsRef.current.add(take.url);
        setTakes((t) => [...t, take]);
        useTake(take);
        toast.success("Your voice take is ready.");
      };
      v.volume = originalVol;
      setRecElapsed(0);
      elapsedTimer.current = window.setInterval(() => setRecElapsed((performance.now() - recStart) / 1000), 200);
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      await v.play();
      v.onended = () => stopRecording();
    } catch (error) {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      recorderRef.current = null; setRecording(false);
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (meterRaf.current != null) cancelAnimationFrame(meterRaf.current);
      if (elapsedTimer.current != null) clearInterval(elapsedTimer.current);
      void audioCtxRef.current?.close().catch(() => {});
      setCountdown(0);
      setOperationError(error instanceof Error ? error.message : "Microphone access was blocked.");
    } finally { recordingPending.current = false; if (!disposedRef.current) setPreparingRecording(false); }
  }

  function useTake(t: Take) {
    videoRef.current?.pause(); audioRef.current?.pause();
    setExportUrl(null); setLipUrl("");
    setActiveTake(t.id);
    setDubMime(t.mime); setDubB64(t.b64); setDubUrl(t.url);
    // Frame-snap the take's start and end so the dub covers exactly the
    // video segment it was recorded over — lips match frame by frame.
    setOffset(Math.round(t.startAt * fps) / fps);
    setTakeEnd(Math.round(t.endAt * fps) / fps);
  }

  function deleteTake(id: string) {
    const deleted = takes.find((take) => take.id === id);
    if (deleted) { URL.revokeObjectURL(deleted.url); takeUrlsRef.current.delete(deleted.url); }
    setTakes((ts) => {
      const rest = ts.filter((x) => x.id !== id);
      if (activeTake === id) {
        const nxt = rest[rest.length - 1];
        if (nxt) useTake(nxt); else { setActiveTake(null); setDubUrl(null); setDubB64(""); setTakeEnd(null); }
      }
      return rest;
    });
  }

  function stopRecording() {
    // Capture the exact video frame where recording stopped.
    const v = videoRef.current;
    recEndRef.current = v ? Math.round(v.currentTime * fps) / fps : 0;
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    recorderRef.current = null;
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    setRecording(false);
    videoRef.current?.pause();
  }

  useEffect(() => { if (monitorGainRef.current) monitorGainRef.current.gain.value = monitorOn ? 1 : 0; }, [monitorOn]);

  async function exportVideo() {
    if (!file || !dubB64) { toast.error("Need a video and a dub track."); return; }
    if (locked) return;
    const abort = new AbortController(); exportAbort.current = abort;
    setOperationError(""); setExportUrl(null);
    setExporting(true); setExportPct(0);
    let encoder: import("@ffmpeg/ffmpeg").FFmpeg | undefined;
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile } = await import("@ffmpeg/util");
      const ff = new FFmpeg();
      encoder = ff; encoderRef.current = ff;
      ff.on("progress", ({ progress }) => setExportPct(Math.round(Math.min(1, Math.max(0, progress)) * 100)));
      await initializeEncoder(ff, abort.signal);
      if (abort.signal.aborted) throw new Error("Cancelled");
      const inExt = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4").toLowerCase();
      const dubExt = mediaExtension(dubMime);
      await ff.writeFile(`in${inExt}`, await fetchFile(file));
      await ff.writeFile(`dub.${dubExt}`, await fetchFile(base64ToBlob(dubB64, dubMime)));
      const voiceFilter = `[1:a]${dubAudioFilter(offset, takeEnd, dubVol)}[dv]`;
      const mixFilter = `[0:a]volume=${originalVol.toFixed(2)}[bg];${voiceFilter};[bg][dv]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`;
      const encode = async (background: boolean) => runEncoder(ff, [
        "-i", `in${inExt}`, "-i", `dub.${dubExt}`,
        "-filter_complex", background ? mixFilter : voiceFilter,
        "-map", "0:v:0", "-map", background ? "[aout]" : "[dv]",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:a", "aac", "-b:a", "192k", "-shortest",
        "-movflags", "+faststart", "-y", "out.mp4",
      ]);
      try { await encode(originalVol > 0); }
      catch (error) { if (abort.signal.aborted || originalVol === 0) throw error; await encode(false); }
      if (abort.signal.aborted) throw new Error("Cancelled");
      const data = await ff.readFile("out.mp4");
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      setExportUrl(URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: "video/mp4" })));
      toast.success("Dubbed video ready to download.");
    } catch (e: any) {
      if (!abort.signal.aborted) setOperationError(`Export failed: ${e?.message ?? e}`);
    } finally {
      encoder?.terminate(); encoderRef.current = null; exportAbort.current = null;
      if (!disposedRef.current) setExporting(false);
    }
  }

  async function runLipSync() {
    if (!file || !dubB64) { toast.error("Need a video and a dub track."); return; }
    if (locked) return;
    setOperationError("");
    setLipBusy(true); setLipStatus("Uploading…"); setLipUrl("");
    try {
      const upl: any = await runUpload({ data: { videoName: file.name } });
      const v = await supabase.storage.from("lipsync-temp")
        .uploadToSignedUrl(upl.video.path, upl.video.token, file, { contentType: file.type || "video/mp4", upsert: true });
      if (v.error) throw new Error(v.error.message);
      // Bake the frame-snapped timing into the dub so the engine drives the
      // mouth from an audio track that already sits on the video's timeline.
      const snapped = Math.round(offset * (fps || 25)) / (fps || 25);
      const alignedDub = await buildAlignedDub(
        base64ToBlob(dubB64, dubMime),
        snapped,
        videoRef.current?.duration ?? 0,
      );
      const a = await supabase.storage.from("lipsync-temp")
        .uploadToSignedUrl(upl.audio.path, upl.audio.token, alignedDub, { contentType: "audio/wav", upsert: true });
      if (a.error) throw new Error(a.error.message);
      setLipStatus("Matching the lips to the new voice…");
      const userSyncSoKey = getUserSyncSoKey();
      const start: any = await runStartLip({ data: { videoPath: upl.video.path, audioPath: upl.audio.path, videoName: file.name, model: "lipsync-2", userSyncSoKey } });
      const deadline = Date.now() + 30 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        if (disposedRef.current) return;
        const p: any = await runPollLip({ data: { jobId: start.jobId, userSyncSoKey } });
        setLipStatus(`Rendering: ${p.status}`);
        if (p.status === "COMPLETED" && p.outputUrl) { setLipUrl(p.outputUrl); setLipStatus("Done"); return; }
        if (["FAILED", "REJECTED", "CANCELED"].includes(p.status)) throw new Error(p.error ?? p.status);
      }
      throw new Error("Timed out");
    } catch (e: any) {
      setLipStatus("");
      setOperationError(`Lip-sync failed: ${e?.message ?? e}`);
    } finally {
      setLipBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Film className="h-6 w-6 text-primary" /> Movie Dubbing
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a video, record your own voice while it plays, hear it layered over the movie live, then match the lips.
          </p>
        </header>

        {operationError && <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"><AlertCircle className="size-5 shrink-0 text-destructive" /><p className="min-w-0 flex-1 break-words text-sm">{operationError}</p><Button variant="outline" size="icon" aria-label="Dismiss error" onClick={() => setOperationError("")}><X /></Button></div>}
        {/* 1. Upload */}
        <section className="border-t border-border py-5">
          <h2 className="mb-3 text-sm font-medium">1 · Your video</h2>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm hover:bg-accent/40">
            <Upload className="h-5 w-5 text-primary" />
            <span className="min-w-0 break-words">{file ? file.name : "Choose a video (MP4, MOV, WebM — up to 3 GB)"}</span>
            <input type="file" accept="video/*" disabled={locked} aria-label="Upload movie video" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </label>

          {videoUrl && (
            <div className="mt-4 space-y-3">
              <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" aria-label="Movie preview" onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); if (recorderRef.current?.state === "recording") stopRecording(); }} onError={() => setOperationError("This video format cannot be previewed. Try MP4 or WebM.")} className="aspect-video w-full rounded-lg bg-ink object-contain" />
              {dubUrl && <audio ref={audioRef} src={dubUrl} preload="metadata" className="hidden" />}
              <Button variant="outline" disabled={locked} onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) void v.play().catch(() => setOperationError("Playback was blocked.")); else v.pause(); }}>{playing ? <Pause /> : <Play />}{playing ? "Pause preview" : "Play preview"}</Button>
              <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-3">
                <Slider label="Original audio" value={originalVol} onChange={setOriginalVol} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
                <Slider label="Dub voice" value={dubVol} onChange={setDubVol} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
                <Slider
                  label={`Dub timing (${fps} fps)`}
                  value={offset}
                  onChange={(v) => setOffset(Math.round(v / frameStep) * frameStep)}
                  min={-5}
                  max={Math.max(5, videoRef.current?.duration || 5)}
                  step={frameStep}
                  format={(v) => `${v > 0 ? "+" : ""}${Math.round(v / frameStep)} fr · ${v.toFixed(3)}s`}
                />
              </fieldset>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline"
                  type="button"
                  onClick={autoAlign}
                  disabled={!dubUrl || locked}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {aligning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Auto-align to the picture
                </Button>
                <Button variant="outline" type="button" onClick={() => nudgeFrames(-1)} disabled={!dubUrl || locked} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">
                  <ChevronLeft className="h-4 w-4" /> 1 frame
                </Button>
                <Button variant="outline" type="button" onClick={() => nudgeFrames(1)} disabled={!dubUrl || locked} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">
                  1 frame <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline"
                  type="button"
                  onClick={scanMouth}
                  disabled={locked}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {mouthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                  {mouthBusy ? `Reading the mouth ${mouthPct}%` : mouth ? "Re-read the mouth" : "Track mouth movements"}
                </Button>
                <Button variant="outline"
                  type="button"
                  onClick={alignToMouth}
                  disabled={!mouth || !dubUrl || locked}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {aligning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Match to the lips
                </Button>
                <span className="text-xs text-muted-foreground">
                  {offsetFrames >= 0 ? "+" : ""}{offsetFrames} frame{Math.abs(offsetFrames) === 1 ? "" : "s"}
                </span>
              </div>
              {alignNote && <p className="text-xs text-muted-foreground">{alignNote}</p>}
              {mouth && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Mouth openness while playing</span>
                    <span className="tabular-nums">face seen in {Math.round(mouth.faceCoverage * 100)}% of frames</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.min(100, Math.round(mouthLevel * 300))}%` }} />
                  </div>
                </div>
              )}
              {dubUrl && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Volume2 className="h-3.5 w-3.5" /> Press play on the video — your voice plays on top, in sync.
                </p>
              )}
            </div>
          )}
        </section>

        {/* 2. Voice */}
        <section className="border-t border-border py-5">
          <h2 className="mb-3 text-sm font-medium">2 · Your voice</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Hit record and speak along while the video plays. Your take is layered straight onto the movie.
          </p>

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Live voice effect</div>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(FX_LABEL) as VoiceFx[]).map((k) => (
                  <Button variant="outline" key={k} disabled={locked} onClick={() => setVoiceFx(k)}
                    className={`rounded-md border px-2.5 py-1 text-xs disabled:opacity-50 ${voiceFx === k ? "border-primary bg-primary/15 text-primary" : "border-border"}`}>
                    {FX_LABEL[k]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={monitorOn} onChange={(e) => setMonitorOn(e.target.checked)} /> Hear myself live (use headphones)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cleanMic} disabled={locked} onChange={(e) => setCleanMic(e.target.checked)} /> Reduce background noise</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={fromHere} disabled={locked} onChange={(e) => setFromHere(e.target.checked)} /> Start from where the video is paused</label>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-3">
            <Mic className={`h-4 w-4 ${recording ? "text-destructive" : "text-muted-foreground"}`} />
            <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.round(micLevel * 100)}%` }} />
            </div>
            <span className="w-14 text-right font-mono text-xs text-muted-foreground">
              {countdown ? `${countdown}…` : recording ? `${recElapsed.toFixed(1)}s` : "ready"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {!recording && !preparingRecording ? (
              <Button variant="outline" onClick={startRecording} disabled={!file || locked} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                <Mic className="h-4 w-4" /> {takes.length ? "Record another take" : "Record my voice"}
              </Button>
            ) : (
              <Button variant="outline" onClick={stopRecording} disabled={!!countdown} className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50">
                <Square className="h-4 w-4" /> {countdown ? `Starting in ${countdown}` : "Stop recording"}
              </Button>
            )}
            {dubUrl && !locked && (
              <Button variant="outline" onClick={() => { const v = videoRef.current; if (v) { v.currentTime = offset; void v.play().catch(() => setOperationError("Preview playback was blocked.")); } }} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm">
                <Play className="h-4 w-4" /> Preview selected take
              </Button>
            )}
          </div>

          {takes.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-xs text-muted-foreground">Your takes — pick one to preview on the video</div>
              {takes.map((t, i) => (
                <div key={t.id} className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${activeTake === t.id ? "border-primary bg-primary/10" : "border-border"}`}>
                  <Button variant="outline" onClick={() => useTake(t)} disabled={locked} className="min-w-0 flex-1 whitespace-normal text-left">
                    Take {i + 1} · {t.dur.toFixed(1)}s · {FX_LABEL[t.fx]}{t.startAt ? ` · from ${t.startAt.toFixed(1)}s` : ""}
                  </Button>
                  <Button variant="outline" disabled={locked} onClick={() => { useTake(t); const v = videoRef.current; if (v) { v.currentTime = t.startAt; requestAnimationFrame(() => { void v.play().catch(() => setOperationError("Preview playback was blocked.")); }); } }} className="rounded border border-border px-2 py-0.5 text-xs">Preview</Button>
                  <a href={t.url} download={`take-${i + 1}.${mediaExtension(t.mime)}`} className="rounded border border-border px-2 py-0.5 text-xs">Save</a>
                  <Button variant="outline" disabled={locked} aria-label={`Delete take ${i + 1}`} onClick={() => deleteTake(t.id)} className="rounded border border-border px-2 py-0.5 text-xs text-destructive">Delete</Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Finish */}
        <section className="border-t border-border py-5">
          <h2 className="mb-3 text-sm font-medium">3 · Finish</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportVideo} disabled={!dubUrl || locked} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? `Building video ${exportPct}%` : "Save dubbed video"}
            </Button>
            <Button variant="outline" onClick={runLipSync} disabled={!dubUrl || locked} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50">
              {lipBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
              Match the lips
            </Button>
          </div>
          {exporting && <Button variant="outline" onClick={() => { exportAbort.current?.abort(); encoderRef.current?.terminate(); }}><Square />Cancel export</Button>}
          {lipStatus && <p className="mt-2 text-xs text-muted-foreground">{lipStatus}</p>}
          {exportUrl && (
            <div className="mt-4 space-y-2">
              <video src={exportUrl} controls className="w-full rounded-lg bg-ink" />
              <a href={exportUrl} download="dubbed.mp4" className="inline-flex items-center gap-2 text-sm text-primary underline">
                <Download className="h-4 w-4" /> Download dubbed.mp4
              </a>
            </div>
          )}
          {lipUrl && (
            <div className="mt-4 space-y-2">
              <video src={lipUrl} controls className="w-full rounded-lg bg-ink" />
              <a href={lipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline">
                <Download className="h-4 w-4" /> Download lip-synced video
              </a>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Slider({ label, value, onChange, min, max, step, format }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 flex items-center justify-between text-muted-foreground">
        <span>{label}</span><span className="tabular-nums">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary" />
    </label>
  );
}
