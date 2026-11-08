// Lightweight per-cue language detector based on Unicode script coverage.
// Works for ANY transcription provider (not just Gemini/Qwen) because it
// operates on the returned text, not on provider metadata.
//
// It's a heuristic — good enough for "which language is this cue in?" so we
// can label cues and mark language-change points on the timeline. It is not
// a substitute for a full language ID model.

export type LangInfo = {
  code: string;       // ISO-639-1 where possible ("en", "hi", "ja", …); "und" if unknown
  name: string;       // Human name shown in the badge
  script: string;     // Script family used to guess ("Latin", "Devanagari", …)
};

const UNKNOWN: LangInfo = { code: "und", name: "Unknown", script: "Unknown" };

// Script -> default language guess. When a script maps to multiple common
// languages (Latin, Arabic, Cyrillic, CJK) we refine below with word/char
// heuristics; otherwise the script itself is a reliable hint.
const SCRIPT_RANGES: Array<{ script: string; test: (cp: number) => boolean }> = [
  { script: "Devanagari", test: (c) => c >= 0x0900 && c <= 0x097f },
  { script: "Bengali",    test: (c) => c >= 0x0980 && c <= 0x09ff },
  { script: "Gurmukhi",   test: (c) => c >= 0x0a00 && c <= 0x0a7f },
  { script: "Gujarati",   test: (c) => c >= 0x0a80 && c <= 0x0aff },
  { script: "Oriya",      test: (c) => c >= 0x0b00 && c <= 0x0b7f },
  { script: "Tamil",      test: (c) => c >= 0x0b80 && c <= 0x0bff },
  { script: "Telugu",     test: (c) => c >= 0x0c00 && c <= 0x0c7f },
  { script: "Kannada",    test: (c) => c >= 0x0c80 && c <= 0x0cff },
  { script: "Malayalam",  test: (c) => c >= 0x0d00 && c <= 0x0d7f },
  { script: "Sinhala",    test: (c) => c >= 0x0d80 && c <= 0x0dff },
  { script: "Thai",       test: (c) => c >= 0x0e00 && c <= 0x0e7f },
  { script: "Lao",        test: (c) => c >= 0x0e80 && c <= 0x0eff },
  { script: "Myanmar",    test: (c) => c >= 0x1000 && c <= 0x109f },
  { script: "Khmer",      test: (c) => c >= 0x1780 && c <= 0x17ff },
  { script: "Georgian",   test: (c) => c >= 0x10a0 && c <= 0x10ff },
  { script: "Ethiopic",   test: (c) => c >= 0x1200 && c <= 0x137f },
  { script: "Hebrew",     test: (c) => c >= 0x0590 && c <= 0x05ff },
  { script: "Arabic",     test: (c) => (c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0x08a0 && c <= 0x08ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff) },
  { script: "Greek",      test: (c) => (c >= 0x0370 && c <= 0x03ff) || (c >= 0x1f00 && c <= 0x1fff) },
  { script: "Cyrillic",   test: (c) => (c >= 0x0400 && c <= 0x04ff) || (c >= 0x0500 && c <= 0x052f) },
  { script: "Armenian",   test: (c) => c >= 0x0530 && c <= 0x058f },
  { script: "Hiragana",   test: (c) => c >= 0x3040 && c <= 0x309f },
  { script: "Katakana",   test: (c) => (c >= 0x30a0 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff) },
  { script: "Hangul",     test: (c) => (c >= 0xac00 && c <= 0xd7af) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f) },
  { script: "Han",        test: (c) => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x20000 && c <= 0x2a6df) },
  { script: "Latin",      test: (c) => (c >= 0x0041 && c <= 0x005a) || (c >= 0x0061 && c <= 0x007a) || (c >= 0x00c0 && c <= 0x024f) || (c >= 0x1e00 && c <= 0x1eff) },
];

// Common stop-word buckets for scripts that host multiple major languages.
// We match whole tokens (case-insensitive) so short cues stay accurate.
const STOPWORDS: Record<string, string[]> = {
  en: ["the","and","you","that","this","with","for","are","was","have","not","but","from","they","what","your","just","like","know","really"],
  es: ["que","los","las","por","para","con","una","como","pero","más","este","esta","muy","cuando","donde","porque","también","nada","siempre"],
  fr: ["que","les","des","une","pour","avec","dans","mais","vous","nous","suis","très","comme","alors","aussi","toujours","parce","quand","peut"],
  de: ["und","der","die","das","ich","ist","nicht","mit","für","auf","auch","wenn","aber","noch","doch","schon","immer","werden","haben"],
  it: ["che","non","con","una","per","gli","dei","questo","questa","molto","come","quando","perché","sempre","anche","allora"],
  pt: ["que","não","uma","com","para","você","isso","como","quando","porque","também","sempre","muito","então","depois"],
  nl: ["het","een","niet","met","van","voor","maar","ook","zijn","hebben","wordt","zoals","altijd","omdat","wanneer"],
  tr: ["bir","için","değil","gibi","kadar","daha","çok","şimdi","zaman","zaten","hala","hiç","ama","ile","olan"],
  id: ["yang","tidak","dengan","untuk","dari","saja","juga","tapi","bisa","sudah","akan","adalah","karena","seperti"],
  vi: ["không","của","và","là","cho","với","này","đó","được","người","những","một","trong","tôi","bạn","rất"],
  pl: ["nie","jest","się","tak","już","może","tylko","tego","jego","kiedy","tam","też","bardzo","wszystko"],
  // Arabic-script variants
  ar: ["في","من","على","إلى","هذا","هذه","التي","الذي","هو","هي","لا","ما","لكن","كل","بعض","عن"],
  ur: ["ہے","کے","کی","کا","میں","سے","کو","اور","یہ","وہ","لیکن","بھی","نہیں","کیا","ہوں","تھا"],
  fa: ["است","که","این","برای","خیلی","اما","هست","نمی","شود","هستند","بودم","خواهد","باید","چون"],
  // Cyrillic-script variants
  ru: ["это","что","как","для","всё","уже","только","если","когда","тоже","мне","тебя","очень","нет","да"],
  uk: ["що","як","для","цей","вже","тільки","якщо","коли","також","мені","тебе","дуже","так","ні"],
  // CJK Han refinement
  zh: ["的","是","不","了","在","我","你","他","她","们","这","那","有","和","就","都","很","也"],
};

const SCRIPT_TO_LANG: Record<string, { code: string; name: string }> = {
  Devanagari: { code: "hi", name: "Hindi" },
  Bengali:    { code: "bn", name: "Bengali" },
  Gurmukhi:   { code: "pa", name: "Punjabi" },
  Gujarati:   { code: "gu", name: "Gujarati" },
  Oriya:      { code: "or", name: "Odia" },
  Tamil:      { code: "ta", name: "Tamil" },
  Telugu:     { code: "te", name: "Telugu" },
  Kannada:    { code: "kn", name: "Kannada" },
  Malayalam:  { code: "ml", name: "Malayalam" },
  Sinhala:    { code: "si", name: "Sinhala" },
  Thai:       { code: "th", name: "Thai" },
  Lao:        { code: "lo", name: "Lao" },
  Myanmar:    { code: "my", name: "Burmese" },
  Khmer:      { code: "km", name: "Khmer" },
  Georgian:   { code: "ka", name: "Georgian" },
  Ethiopic:   { code: "am", name: "Amharic" },
  Hebrew:     { code: "he", name: "Hebrew" },
  Greek:      { code: "el", name: "Greek" },
  Armenian:   { code: "hy", name: "Armenian" },
  Hiragana:   { code: "ja", name: "Japanese" },
  Katakana:   { code: "ja", name: "Japanese" },
  Hangul:     { code: "ko", name: "Korean" },
};

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", nl: "Dutch", tr: "Turkish", id: "Indonesian", vi: "Vietnamese",
  pl: "Polish", ru: "Russian", uk: "Ukrainian", ar: "Arabic", ur: "Urdu",
  fa: "Persian", zh: "Chinese", ja: "Japanese", ko: "Korean",
};

function refineByStopwords(text: string, candidates: string[]): string | null {
  const lower = ` ${text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ")} `;
  let best: { code: string; hits: number } | null = null;
  for (const code of candidates) {
    const words = STOPWORDS[code];
    if (!words) continue;
    let hits = 0;
    for (const w of words) if (lower.includes(` ${w} `)) hits++;
    if (hits > 0 && (!best || hits > best.hits)) best = { code, hits };
  }
  return best?.code ?? null;
}

export function detectLangForText(text: string): LangInfo {
  const trimmed = text.trim();
  if (!trimmed) return UNKNOWN;

  // Tally script coverage over letter code points.
  const counts = new Map<string, number>();
  let letters = 0;
  for (const ch of trimmed) {
    const cp = ch.codePointAt(0) ?? 0;
    // Ignore whitespace, digits, punctuation for the primary tally.
    const isLetter = /\p{L}/u.test(ch);
    if (!isLetter) continue;
    letters++;
    for (const { script, test } of SCRIPT_RANGES) {
      if (test(cp)) { counts.set(script, (counts.get(script) ?? 0) + 1); break; }
    }
  }
  if (letters === 0) return UNKNOWN;

  // Pick dominant script.
  let topScript = ""; let topCount = 0;
  for (const [s, n] of counts) if (n > topCount) { topScript = s; topCount = n; }
  if (!topScript) return UNKNOWN;

  // Han-only text is usually Chinese unless mixed with Hiragana/Katakana.
  if (topScript === "Han") {
    if ((counts.get("Hiragana") ?? 0) + (counts.get("Katakana") ?? 0) > 0) {
      return { code: "ja", name: "Japanese", script: "Japanese" };
    }
    return { code: "zh", name: "Chinese", script: "Han" };
  }

  // Direct script mappings.
  if (SCRIPT_TO_LANG[topScript]) {
    const m = SCRIPT_TO_LANG[topScript];
    return { code: m.code, name: m.name, script: topScript };
  }

  // Latin / Arabic / Cyrillic — refine via stopword overlap.
  if (topScript === "Latin") {
    const code = refineByStopwords(trimmed, ["en","es","fr","de","it","pt","nl","tr","id","vi","pl"]) ?? "en";
    return { code, name: LANG_NAMES[code] ?? code.toUpperCase(), script: "Latin" };
  }
  if (topScript === "Arabic") {
    const code = refineByStopwords(trimmed, ["ar","ur","fa"]) ?? "ar";
    return { code, name: LANG_NAMES[code] ?? code.toUpperCase(), script: "Arabic" };
  }
  if (topScript === "Cyrillic") {
    const code = refineByStopwords(trimmed, ["ru","uk"]) ?? "ru";
    return { code, name: LANG_NAMES[code] ?? code.toUpperCase(), script: "Cyrillic" };
  }

  return UNKNOWN;
}

export type LangCue = { start: number; end: number; text: string; lang: LangInfo };

export function detectCueLangs(cues: { start: number; end: number; text: string }[]): LangCue[] {
  return cues.map((c) => ({ ...c, lang: detectLangForText(c.text) }));
}

export type LangMarker = { at: number; from: string | null; to: string; name: string; cueIndex: number };

// Return points where the detected language changes (skipping "und" runs so
// the timeline doesn't fill with noise on empty/punctuation-only cues).
export function detectLangChanges(cues: LangCue[]): LangMarker[] {
  const markers: LangMarker[] = [];
  let prev: string | null = null;
  for (let i = 0; i < cues.length; i++) {
    const code = cues[i].lang.code;
    if (code === "und") continue;
    if (code !== prev) {
      markers.push({ at: cues[i].start, from: prev, to: code, name: cues[i].lang.name, cueIndex: i });
      prev = code;
    }
  }
  return markers;
}
