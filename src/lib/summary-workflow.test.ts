import { describe, expect, it } from "vitest";
import { summaryBaseName, summaryPlainText, summaryTranscript } from "./summary-workflow";

describe("summary workflow", () => {
  it("imports timed subtitles as spoken text", () => {
    expect(summaryTranscript("1\n00:00:01,000 --> 00:00:03,000\nThe meeting begins.\n\n2\n00:00:04,000 --> 00:00:06,000\nWe review the budget.")).toBe("The meeting begins.\nWe review the budget.");
  });
  it("retains plain transcripts", () => {
    expect(summaryTranscript("  First speaker: Hello.\nSecond speaker: Welcome.  ")).toBe("First speaker: Hello.\nSecond speaker: Welcome.");
  });
  it("removes formatting without losing underscores in names or bullet structure", () => {
    expect(summaryPlainText("## Topics\n- **release_v2** and [notes](https://example.com)\n> `ready`")).toBe("Topics\n- release_v2 and notes\nready");
  });
  it("makes safe export filenames", () => {
    expect(summaryBaseName('meeting<2026>.mp4')).toBe("meeting_2026_");
    expect(summaryBaseName(".wav")).toBe("summary");
  });
});