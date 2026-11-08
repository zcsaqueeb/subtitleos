import { expect, it } from "vitest";
import { dubAudioFilter, mediaExtension, normalizeDubScript } from "./dubbing-workflow";

it("keeps a recorded take within its selected video segment", () => {
  expect(dubAudioFilter(12, 15, 1)).toBe("atrim=start=0:duration=3,asetpts=PTS-STARTPTS,adelay=12000:all=1,volume=1.00,apad");
});
it("trims early audio instead of ignoring negative timing", () => {
  expect(dubAudioFilter(-1, 3, 0.5)).toBe("atrim=start=1:duration=3,asetpts=PTS-STARTPTS,adelay=0:all=1,volume=0.50,apad");
});
it("normalizes VTT timing for character scripts", () => {
  expect(normalizeDubScript("WEBVTT\n\n00:01.000 --> 00:03.000\nMAYA: Hello")).toBe("1\n00:00:01,000 --> 00:00:03,000\nMAYA: Hello");
});
it("preserves recorded WebM file extensions", () => {
  expect(mediaExtension("audio/webm;codecs=opus")).toBe("webm");
  expect(mediaExtension("audio/ogg")).toBe("ogg");
});