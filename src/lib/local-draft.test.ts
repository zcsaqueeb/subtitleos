import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDraft, isConnectionError, readDraft, writeDraft } from "./local-draft";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const entries = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => entries.set(k, v),
    removeItem: (k: string) => entries.delete(k),
  } });
}
describe("local subtitle drafts", () => {
  it("preserves edited subtitles and selected settings for restoration", () => {
    storage();
    const draft = { content: "1\n00:00:01,000 --> 00:00:02,000\nEdited", targetLang: "ur", exportKind: "vtt" };
    expect(writeDraft("translator", draft, 123)).toBe(true);
    expect(readDraft("translator")).toEqual({ v: draft, at: 123 });
  });
  it("reports storage failures instead of claiming a save", () => {
    vi.stubGlobal("window", { localStorage: { setItem: () => { throw new Error("Quota"); } } });
    expect(writeDraft("translator", "edits")).toBe(false);
  });
  it("clears only the selected tool draft", () => {
    storage(); writeDraft("translator", "one"); writeDraft("transcribe", "two"); clearDraft("translator");
    expect(readDraft("translator")).toBeNull();
    expect(readDraft<{ v: string }>("transcribe")?.v).toBe("two");
  });
  it("identifies interrupted requests while offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isConnectionError(new Error("Request failed"))).toBe(true);
  });
  it("does not misclassify invalid credentials as a lost connection", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isConnectionError(new Error("Unauthorized provider key"))).toBe(false);
  });
});