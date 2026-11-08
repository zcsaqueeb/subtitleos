// Character types + default ElevenLabs voices per type. Client-safe.
export type CharacterType =
  | "adult_male" | "adult_female" | "boy" | "girl"
  | "elderly_male" | "elderly_female" | "narrator"
  | "robot" | "alien" | "monster" | "fantasy" | "superhero" | "neutral";

export const CHARACTER_TYPES: Array<{ id: CharacterType; label: string; defaultVoice: string }> = [
  { id: "adult_male",    label: "Adult Male",    defaultVoice: "JBFqnCBsd6RMkjVDRZzb" }, // George
  { id: "adult_female",  label: "Adult Female",  defaultVoice: "EXAVITQu4vr4xnSDxMaL" }, // Sarah
  { id: "boy",           label: "Boy",           defaultVoice: "IKne3meq5aSn9XLyUdCD" }, // Charlie
  { id: "girl",          label: "Girl",          defaultVoice: "XrExE9yKIg1WjnnlVkGX" }, // Matilda
  { id: "elderly_male",  label: "Elderly Male",  defaultVoice: "pqHfZKP75CvOlQylNhV4" }, // Bill
  { id: "elderly_female",label: "Elderly Female",defaultVoice: "Xb7hH8MSUJpSbSDYk0k2" }, // Alice
  { id: "narrator",      label: "Narrator",      defaultVoice: "onwK4e9ZLuTAKqWW03F9" }, // Daniel
  { id: "robot",         label: "Robot",         defaultVoice: "kPtEHAvRnjUJFv7SK9WI" }, // Glitch
  { id: "alien",         label: "Alien",         defaultVoice: "N2lVS1w4EtoT3dr4eOWO" }, // Callum
  { id: "monster",       label: "Monster",       defaultVoice: "nPczCjzI2devNBz1zQrb" }, // Brian
  { id: "fantasy",       label: "Fantasy",       defaultVoice: "h6u4tPKmcPlxUdZOaVpH" }, // Reindeer
  { id: "superhero",     label: "Superhero",     defaultVoice: "bIHbv24MWmeRgasZH58o" }, // Will
  { id: "neutral",       label: "Neutral",       defaultVoice: "SAz9YHcvj6GT2YYXdXww" }, // River
];

export function defaultVoiceForType(t: string | null | undefined): string {
  return CHARACTER_TYPES.find((x) => x.id === t)?.defaultVoice
    ?? CHARACTER_TYPES.find((x) => x.id === "neutral")!.defaultVoice;
}

export function labelForType(t: string | null | undefined): string {
  return CHARACTER_TYPES.find((x) => x.id === t)?.label ?? "Neutral";
}

export const EMOTIONS = [
  "neutral","happy","sad","angry","fear","excited","calm","serious",
  "whisper","crying","laughing","shouting","nervous","confused","romantic","emotional",
] as const;
export type Emotion = typeof EMOTIONS[number];

// Map emotion → ElevenLabs voice_settings tweaks. Consistency of voice_id is
// preserved; only delivery changes.
export function emotionSettings(e: string | null | undefined) {
  switch ((e ?? "neutral") as Emotion) {
    case "whisper":   return { stability: 0.85, similarity_boost: 0.85, style: 0.15, speed: 0.9 };
    case "shouting":  return { stability: 0.25, similarity_boost: 0.75, style: 0.85, speed: 1.05 };
    case "angry":     return { stability: 0.30, similarity_boost: 0.75, style: 0.75, speed: 1.02 };
    case "sad":       return { stability: 0.65, similarity_boost: 0.80, style: 0.35, speed: 0.92 };
    case "crying":    return { stability: 0.55, similarity_boost: 0.80, style: 0.55, speed: 0.90 };
    case "happy":     return { stability: 0.40, similarity_boost: 0.80, style: 0.60, speed: 1.02 };
    case "excited":   return { stability: 0.30, similarity_boost: 0.80, style: 0.75, speed: 1.06 };
    case "laughing":  return { stability: 0.35, similarity_boost: 0.80, style: 0.70, speed: 1.05 };
    case "fear":      return { stability: 0.45, similarity_boost: 0.80, style: 0.55, speed: 1.03 };
    case "nervous":   return { stability: 0.45, similarity_boost: 0.80, style: 0.50, speed: 1.04 };
    case "confused":  return { stability: 0.55, similarity_boost: 0.80, style: 0.40, speed: 0.98 };
    case "romantic":  return { stability: 0.70, similarity_boost: 0.85, style: 0.45, speed: 0.95 };
    case "calm":      return { stability: 0.75, similarity_boost: 0.80, style: 0.30, speed: 0.97 };
    case "serious":   return { stability: 0.70, similarity_boost: 0.80, style: 0.35, speed: 0.98 };
    case "emotional": return { stability: 0.55, similarity_boost: 0.80, style: 0.55, speed: 0.97 };
    default:          return { stability: 0.50, similarity_boost: 0.80, style: 0.40, speed: 1.00 };
  }
}
