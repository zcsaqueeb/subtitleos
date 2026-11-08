import { describe, expect, it } from "vitest";
import { activeCaption, captionsToSrt, parseTimedCaptions, srtTimestamp, videoOnlyArgs } from "./media-tools";

describe("caption timing", () => {
  it("reads short WebVTT times and ignores cue settings", () => {
    expect(parseTimedCaptions("WEBVTT\n\nintro\n00:01.250 --> 00:03.000 align:start\nHello")).toEqual([{ start: 1.25, end: 3, text: "Hello" }]);
  });
  it("uses an exclusive end and applies positive timing offsets in preview", () => {
    const cues = [{ start: 1, end: 2, text: "Voice" }];
    expect(activeCaption(cues, 1, 0.5)).toBe("");
    expect(activeCaption(cues, 1.5, 0.5)).toBe("Voice");
    expect(activeCaption(cues, 2.5, 0.5)).toBe("");
  });
  it("carries rounded milliseconds into the next minute", () => {
    expect(srtTimestamp(59.9996)).toBe("00:01:00,000");
  });
  it("drops captions entirely before zero after a negative offset", () => {
    expect(captionsToSrt([{ start: 0, end: 1, text: "Old" }, { start: 1, end: 3, text: "Keep" }], -2)).toBe("1\n00:00:00,000 --> 00:00:01,000\nKeep");
  });
  it("parses ASS dialogue with commas and line breaks", () => {
    expect(parseTimedCaptions("Dialogue: 0,0:00:01.20,0:00:03.40,Default,,0,0,0,,{\\b1}Hello, world\\NAgain")).toEqual([{ start: 1.2, end: 3.4, text: "Hello, world\nAgain" }]);
  });
  it("removes audio map and codecs from silent-video fallback", () => {
    expect(videoOnlyArgs(["-filter_complex", "video;audio", "-map", "[v]", "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "out.mp4"], "video")).toEqual(["-filter_complex", "video", "-map", "[v]", "out.mp4"]);
  });
});