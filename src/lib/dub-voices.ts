// Shared character-voice catalogue for dubbing pages. Client-safe.
export type VoiceOption = {
  value: string;
  label: string;
  kind: "openai" | "elevenlabs";
  elevenId?: string;
};
export type VoiceGroup = { label: string; options: VoiceOption[] };

const el = (id: string, label: string): VoiceOption => ({
  value: `el:${id}`,
  label,
  kind: "elevenlabs",
  elevenId: id,
});

export const VOICE_GROUPS: VoiceGroup[] = [
  {
    label: "Standard voices",
    options: ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"].map(
      (v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), kind: "openai" as const }),
    ),
  },
  {
    label: "Cinematic characters",
    options: [
      el("nPczCjzI2devNBz1zQrb", "Brian — deep movie narrator"),
      el("JBFqnCBsd6RMkjVDRZzb", "George — warm lead male"),
      el("N2lVS1w4EtoT3dr4eOWO", "Callum — intense villain"),
      el("onwK4e9ZLuTAKqWW03F9", "Daniel — British male"),
      el("bIHbv24MWmeRgasZH58o", "Will — young hero"),
      el("kPtEHAvRnjUJFv7SK9WI", "Glitch — robot / sci-fi"),
      el("h6u4tPKmcPlxUdZOaVpH", "Reindeer — fantasy creature"),
    ],
  },
  {
    label: "Female characters",
    options: [
      el("EXAVITQu4vr4xnSDxMaL", "Sarah — soft lead female"),
      el("XrExE9yKIg1WjnnlVkGX", "Matilda — friendly female"),
      el("cgSgspJ2msm6clMCkdW9", "Jessica — expressive female"),
      el("pFZP5JQG7iQjIQuC4Bku", "Lily — warm British female"),
      el("Xb7hH8MSUJpSbSDYk0k2", "Alice — clear female"),
      el("SAz9YHcvj6GT2YYXdXww", "River — neutral / non-binary"),
    ],
  },
];

export const ALL_VOICE_OPTIONS: VoiceOption[] = VOICE_GROUPS.flatMap((g) => g.options);
export const DEFAULT_VOICE = "alloy";
