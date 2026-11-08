// Real mouth-shape tracking in the browser using MediaPipe FaceLandmarker.
// Scans the video frame by frame, measures how open the speaker's mouth is on
// each frame, and cross-correlates that curve against the dub's speech onsets
// so the dubbed voice lands on the actual lip movements.

import { ENVELOPE_HZ, audioOnsetEnvelope, bestLag, normaliseCurve } from "./lip-align";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type MouthTrack = {
  /** Mouth openness per 10 ms slot (ENVELOPE_HZ grid), 0 when no face was seen. */
  curve: Float32Array;
  /** Fraction of sampled frames where a face was detected. */
  faceCoverage: number;
  /** How many frames were sampled. */
  frames: number;
};

let _landmarker: any | null = null;

/** Pre-download the face-tracking model in the background so the first
 *  mouth-tracking run starts instantly. Safe to call multiple times. */
export function warmMouthTracker() {
  void getLandmarker().catch(() => {});
}

async function getLandmarker() {
  if (_landmarker) return _landmarker;
  const vision: any = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  _landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
  });
  return _landmarker;
}

// MediaPipe FaceMesh indices: inner lip top / bottom, and mouth corners.
const UPPER_LIP = 13;
const LOWER_LIP = 14;
const LEFT_CORNER = 61;
const RIGHT_CORNER = 291;

/**
 * Walk the video at `sampleFps` and record mouth openness (lip gap normalised
 * by mouth width, so it is scale-invariant).
 */
export async function trackMouth(
  videoUrl: string,
  opts: { sampleFps?: number; onProgress?: (p: number) => void; signal?: AbortSignal } = {},
): Promise<MouthTrack> {
  const sampleFps = opts.sampleFps ?? 15;
  const landmarker = await getLandmarker();

  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not read the video."));
  });

  const duration = video.duration || 0;
  if (!duration || !Number.isFinite(duration)) throw new Error("Video has no readable length.");

  const slots = Math.max(1, Math.round(duration * ENVELOPE_HZ));
  const curve = new Float32Array(slots);
  const total = Math.max(1, Math.floor(duration * sampleFps));
  let hits = 0;
  let lastValue = 0;
  let lastSlot = 0;

  const seek = (t: number) =>
    new Promise<void>((resolve) => {
      const done = () => { video.removeEventListener("seeked", done); resolve(); };
      video.addEventListener("seeked", done);
      video.currentTime = Math.min(t, Math.max(0, duration - 0.01));
    });

  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) break;
    const t = (i / sampleFps);
    await seek(t);
    let openness = lastValue;
    try {
      const res = landmarker.detectForVideo(video, Math.round(t * 1000));
      const pts = res?.faceLandmarks?.[0];
      if (pts) {
        const gap = Math.abs(pts[LOWER_LIP].y - pts[UPPER_LIP].y);
        const width =
          Math.hypot(pts[RIGHT_CORNER].x - pts[LEFT_CORNER].x, pts[RIGHT_CORNER].y - pts[LEFT_CORNER].y) || 1;
        openness = Math.max(0, Math.min(1, gap / width));
        hits++;
      }
    } catch {
      /* keep the previous value for this frame */
    }
    const slot = Math.min(slots - 1, Math.round(t * ENVELOPE_HZ));
    for (let s = lastSlot; s <= slot; s++) curve[s] = openness;
    lastSlot = slot + 1;
    lastValue = openness;
    if (opts.onProgress && i % 5 === 0) opts.onProgress(i / total);
  }
  for (let s = lastSlot; s < slots; s++) curve[s] = lastValue;
  opts.onProgress?.(1);

  video.src = "";
  return { curve, faceCoverage: hits / total, frames: total };
}

export type MouthAlignResult = {
  offsetSeconds: number;
  offsetFrames: number;
  fps: number;
  confidence: number;
  faceCoverage: number;
};

/**
 * Align a dub track to the speaker's real mouth movements: the dub's speech
 * onsets are matched against the mouth-opening onsets, then snapped to a whole
 * video frame.
 */
export async function alignDubToMouth(
  track: MouthTrack,
  dubBlob: Blob,
  fps: number,
  maxLagSeconds = 5,
): Promise<MouthAlignResult> {
  const mouth = normaliseCurve(track.curve);
  const dub = await audioOnsetEnvelope(dubBlob);
  const { lag, confidence } = bestLag(mouth, dub, Math.round(maxLagSeconds * ENVELOPE_HZ));
  const raw = lag / ENVELOPE_HZ;
  const offsetFrames = Math.round(raw * fps);
  return {
    offsetSeconds: offsetFrames / fps,
    offsetFrames,
    fps,
    confidence,
    faceCoverage: track.faceCoverage,
  };
}

/** Mouth openness at a given video time (0..1), for the live preview meter. */
export function mouthAt(track: MouthTrack, seconds: number): number {
  const i = Math.max(0, Math.min(track.curve.length - 1, Math.round(seconds * ENVELOPE_HZ)));
  return track.curve[i] ?? 0;
}
