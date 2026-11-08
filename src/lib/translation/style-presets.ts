// Shared style preset catalog. Default = original PRO_RULES (no change).
// Other presets append a short style block to the system prompt.

export type StylePresetId =
  | "default"
  | "netflix"
  | "anime"
  | "disney"
  | "literal"
  | "natural"
  | "dub";

export const STYLE_PRESETS: Array<{ id: StylePresetId; label: string; description: string }> = [
  { id: "default", label: "Default (Pro)", description: "Production-grade streaming quality." },
  { id: "netflix", label: "Netflix Style", description: "Netflix Timed Text Style Guide — concise, broadcast QC." },
  { id: "anime", label: "Anime Fansub", description: "Honorifics, character speech quirks, attack names preserved." },
  { id: "disney", label: "Disney / Family", description: "Family-friendly, warm, no profanity, clean phrasing." },
  { id: "literal", label: "Literal", description: "Closer to the source. Minimal adaptation." },
  { id: "natural", label: "Natural", description: "Free, fluent, conversational. Strong localization." },
  { id: "dub", label: "Dubbing", description: "Lip-sync friendly: shorter lines, matched syllable count." },
];

export function stylePresetPrompt(id: StylePresetId | undefined | null): string {
  switch (id) {
    case "netflix":
      return `\n\nSTYLE PRESET — NETFLIX:\n- Follow Netflix Timed Text Style Guide conventions for the target language.\n- Max 42 chars/line, max 2 lines, reading speed ~17 cps for adults.\n- Use sentence case, neutral register unless scene requires otherwise.\n- Numbers under 10 spelled out unless time/measurement.`;
    case "anime":
      return `\n\nSTYLE PRESET — ANIME FANSUB:\n- Preserve Japanese honorifics (-san, -kun, -chan, -sama, senpai, sensei) when they carry meaning.\n- Keep iconic terms / attack names / techniques in original when the audience expects them; add no notes.\n- Keep character speech quirks (verbal tics, archaic pronouns, regional dialect markers) as flavor in the target language.\n- Slight liberty for punch and rhythm; never break canon meaning.`;
    case "disney":
      return `\n\nSTYLE PRESET — DISNEY / FAMILY:\n- Family-safe wording. No profanity, no crude slang. Soften mild curses to neutral equivalents.\n- Warm, sincere, accessible tone for all ages.\n- Keep songs/poems lyrical and rhyming where the source rhymes.`;
    case "literal":
      return `\n\nSTYLE PRESET — LITERAL:\n- Stay close to the source structure and wording.\n- Minimal cultural adaptation; preserve original phrasing where intelligible.\n- Still produce grammatical, readable target-language output.`;
    case "natural":
      return `\n\nSTYLE PRESET — NATURAL:\n- Prioritize how a native speaker would really say this; rephrase freely.\n- Idioms → natural equivalents. Adapt jokes for the target culture.\n- Conversational rhythm over literal accuracy.`;
    case "dub":
      return `\n\nSTYLE PRESET — DUBBING (LIP-SYNC OPTIMIZED):\n- Match the source syllable count per cue within ±15%. Never exceed the cue duration's speakable length at ~15 syllables/second.\n- Prefer short, punchy lines. Front-load key words; put stresses on the same beats as the source.\n- Choose words whose mouth shapes roughly mirror the source vowels (open-open, round-round, closed-closed) where possible.\n- Preserve character voice: keep each speaker's register (formal/casual/rough/childish), verbal tics, and pronouns consistent across all their lines in the project.\n- Do NOT add filler, do NOT rearrange lines across characters, do NOT merge cues.`;
    case "default":
    default:
      return "";
  }
}
