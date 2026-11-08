import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { subtitleExport, translatedZip, uniqueSubtitlePath } from "./subtitle-workflow";

const srt = "1\n00:00:01,000 --> 00:00:02,500\nHello,123\n\n2\n00:00:03,000 --> 00:00:04,000\nGoodbye";

describe("subtitle exports", () => {
  it("converts only timestamps to VTT without changing dialogue", () => {
    expect(subtitleExport(srt, "vtt")).toContain("00:00:01.000 --> 00:00:02.500\nHello,123");
  });
  it("exports dialogue without cue numbers or timestamps", () => {
    expect(subtitleExport(srt, "txt")).toBe("Hello,123\nGoodbye");
  });
  it("preserves the original SRT", () => expect(subtitleExport(srt, "srt")).toBe(srt));
  it("prevents case-insensitive duplicate paths", () => {
    const used = new Set<string>();
    expect(uniqueSubtitlePath("movie.srt", "ur", used)).toBe("movie.ur.srt");
    expect(uniqueSubtitlePath("Movie.srt", "ur", used)).toBe("Movie (2).ur.srt");
  });
  it("keeps safe folders and drops parent traversal", () => {
    expect(uniqueSubtitlePath("../season/../episode.srt", "es", new Set())).toBe("season/episode.es.srt");
  });
  it("includes both duplicate-name results and excludes failed files", async () => {
    const blob = await translatedZip([
      { name: "movie.srt", status: "done", translated: "first" },
      { name: "movie.srt", status: "done", translated: "second" },
      { name: "failed.srt", status: "error", translated: "bad" },
    ], "ur");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(["movie.ur.srt", "movie (2).ur.srt"]);
    expect(await zip.file("movie (2).ur.srt")?.async("string")).toBe("second");
  });
});