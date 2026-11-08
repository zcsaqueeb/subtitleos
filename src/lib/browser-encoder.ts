import type { FFmpeg } from "@ffmpeg/ffmpeg";

// Imported only by explicit browser processing actions; no worker on page load.
export async function initializeEncoder(ff: FFmpeg, signal?: AbortSignal) {
  const { toBlobURL } = await import("@ffmpeg/util");
  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
  let coreURL: string | undefined;
  let wasmURL: string | undefined;
  const stop = () => ff.terminate();
  signal?.addEventListener("abort", stop, { once: true });
  try {
    await Promise.all([
      toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript").then((url) => { coreURL = url; }),
      toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm").then((url) => { wasmURL = url; }),
    ]);
    if (signal?.aborted) throw new Error("Cancelled");
    await ff.load({ coreURL, wasmURL });
    if (signal?.aborted) throw new Error("Cancelled");
  } catch (error) {
    ff.terminate();
    throw error;
  } finally {
    signal?.removeEventListener("abort", stop);
    if (coreURL) URL.revokeObjectURL(coreURL);
    if (wasmURL) URL.revokeObjectURL(wasmURL);
  }
}

export async function runEncoder(ff: FFmpeg, args: string[]) {
  const code = await ff.exec(args);
  if (code !== 0) throw new Error("The encoder could not process this file. Check the media format and export settings.");
}