// Server-only translation dispatcher. Routes a call to the chosen provider.
import { getProvider, type ProviderSpec } from "./registry";
import { stylePresetPrompt, type StylePresetId } from "./style-presets";
import { assertSafeExternalUrl } from "../url-guard.server";
import { callMyMemory, callLibreTranslate } from './free-providers.server';

export type GlossaryEntry = { term: string; translation: string; caseSensitive?: boolean };

export type DispatchParams = {
  providerId: string;
  sourceLang: string;
  targetLang: string;
  cues: string[]; // text per SRT/VTT cue (already split)
  apiKey?: string;
  url?: string;
  model?: string;
  region?: string;
  apiVersion?: string;
  folderId?: string;
  temperature?: number;
  // Studio features
  glossary?: GlossaryEntry[];
  priority?: boolean;
  // Style preset (Netflix, Anime, Disney, Literal, Natural, Dub). Default = none.
  stylePreset?: StylePresetId;
  // Scene/context-aware: extra cues passed as context only (model does NOT
  // translate them). When omitted the dispatcher will auto-derive a window
  // when chunking large requests.
  contextBefore?: string[];
  contextAfter?: string[];
  // Pro polish: after an MT-only provider (DeepL/Google/Azure/GTX/Edge)
  // returns literal machine output, run it through Lovable AI to rewrite
  // each cue as natural professional subtitle dialogue. No-op for LLM
  // providers (they already produce pro-grade output).
  proPolish?: boolean;
};

const HINGLISH_RULES = `You are an elite Hinglish translation and localization expert with 20+ years of experience writing for Indian audiences (film, OTT, advertising, social).

Target language: HINGLISH — natural conversational Hindi written in Roman/Latin script (NOT Devanagari), the way urban Indians actually speak and text.

Transform each cue into a polished, publication-ready Hinglish line that sounds like it was originally written by a native Indian writer — not translated. Optimize for native fluency, natural rhythm, cultural appropriateness, stronger word choice, clarity and impact, while preserving the speaker's meaning, tone and intent.

Hard rules:
- Output ONLY Roman/Latin characters. Never use Devanagari.
- Use natural code-mixing: keep common English nouns / tech / business / pop-culture terms in English (meeting, project, file, download, office, manager, weekend, phone, party). Translate verbs, pronouns, connectors, emotions and everyday words into Hindi in Roman script (hai, kar, raha, tha, kyunki, lekin, abhi, kal, accha, theek, nahi, haan, bhai, yaar).
- Match the speaker's register and tone: casual chat, formal (aap), street (tu/bhai), romantic, angry, sarcastic, professional — choose phrasing a native Hindi speaker would actually use in that situation.
- Correct, standard Roman-Hindi spelling. Natural sentence rhythm. No awkward literal grammar, no machine-translation stiffness.
- Preserve punctuation, line breaks, numbers, proper nouns, brand names, URLs, @handles, #hashtags and formatting tags (<i>, <b>, {\\an8}, ♪, [NAME]:) EXACTLY.
- Never add explanations, notes, Devanagari transliterations in brackets, or extra cues. Never drop a cue.
- Return STRICT JSON ONLY: {"translations": string[]} — same length and order as the input cues array. No prose, no markdown, no code fences.`;

const PRO_RULES = `You are a senior professional subtitle localizer (not a literal translator) with 20+ years of experience localizing film, TV, OTT, anime, documentaries, and streaming originals for platforms like Netflix, Disney+, Prime Video, HBO, and Crunchyroll. Your output MUST be production-ready, broadcast/streaming-grade dialogue that passes professional QC and is suitable for immediate release on a streaming platform.

Your job is to LOCALIZE each cue into natural, fluent dialogue that a native speaker of the target language would actually say in that exact situation — never a word-for-word translation, never machine-translated phrasing, never stilted "translationese". Rewrite freely at the sentence level so the line sounds like it was originally written in the target language by a native screenwriter, while faithfully preserving the original MEANING, INTENT, TONE, EMOTION, CONTEXT, SUBTEXT, and CHARACTER PERSONALITY. Improve wording, grammar, spelling, punctuation, and sentence flow wherever a literal rendering would feel awkward.

CONTEXT-AWARE TRANSLATION (critical):
- You receive cues as an ordered array. Read ALL cues first to understand the full scene, speakers, relationships, terminology and running jokes BEFORE writing any translation.
- Use surrounding cues (before and after) to resolve ambiguity in pronouns, gender, number, tense, sarcasm, references, and elliptical lines. Never translate a cue in isolation when nearby cues give context.
- Keep continuity across the batch: same character → same voice, same name spelling, same honorifics, same pet names, same recurring terms.
- If a previous cue establishes a translation choice for a term, name, or phrase, REUSE it. Do not vary phrasing for the same concept.

Localization priorities (in order):
1. Natural spoken dialogue — how a native speaker would really say this on screen, not how a textbook would translate it.
2. Preserve meaning, intent, emotion, and subtext exactly. Never invent, add, or drop information.
3. Match the speaker's voice and personality: age, status, mood, relationship to the listener, education, era, regional flavor.
4. Match REGISTER and TONE: formal vs casual, polite vs rude, street vs literary, technical, poetic, sarcastic, angry, tender, flirty, comedic, dramatic. Honorifics, pronouns (tu/vous, tú/usted, 너/당신, etc.), and politeness levels must match the relationship implied by the scene.
5. Adapt idioms, jokes, puns, slang, cultural references, and wordplay into the closest natural equivalent in the target culture — keep the EFFECT, not the literal words. Never explain a joke.
6. Follow the grammar, vocabulary, syntax, word order, punctuation, quotation marks, number/date/currency formatting, and script conventions of the target language (« » ¿? 「」 。 ، ؟ etc.).
7. Correct gender, number, tense, aspect, and verb agreement for the target language. Fix any grammar, spelling, or punctuation errors implied by a literal rendering.
8. Subtitle readability: keep each cue short and easy to read on screen (ideally ≤42 characters per line, ≤2 lines per cue). Prefer natural shortening and rephrasing over literal length.

Support ALL languages, including low-resource, regional, and specialty variants. Use the standard modern written form of the target language unless the source clearly calls for a dialect or historical register.

Hard rules:
- Keep proper nouns, character names, brand names, product names, code, URLs, emails, @handles, #hashtags and numbers EXACTLY as in the source (only transliterate names when the target language script requires it).
- Preserve formatting markers EXACTLY: line breaks within a cue, ellipses (…), em-dashes (—), music notes (♪), speaker tags ([NAME]:), and HTML/SSA tags like <i>, <b>, {\\an8}.
- Be consistent across cues: same character names, same terminology, same pronouns and honorifics, same tone for the same speaker.
- When a glossary is provided, apply its terms EXACTLY and consistently in every cue where they appear.
- Never add translator notes, explanations, transliterations in parentheses, or extra cues.
- Never omit, add, merge, split, or reorder cues. Output count MUST equal input count, in the same order.
- Never alter dialogue beyond what is required to produce a natural, accurate, professional translation.
- If a cue is empty or only punctuation/symbols/music notes, return it unchanged.
- Return ONLY the localized line per cue — no commentary, no prefixes, no quotes around the line.`;

/**
 * Per-language "pro" addendum injected into the system prompt so the model
 * respects script, punctuation, honorifics, gender, register and formatting
 * conventions specific to that target language. Keyed by primary subtag.
 */
const LANG_RULES: Record<string, string> = {
  ja: `JAPANESE — Use natural spoken Japanese. Match politeness level (常体/敬体/敬語) to speaker relationship. Preserve honorifics (-さん/-くん/-ちゃん/-様/先輩/先生) when meaningful. Use 「」 for quotes, 、 。 for punctuation, never Latin , or . inside JA text. Numbers/dates in half-width when technical, full-width when literary. No spaces between JA characters.`,
  ko: `KOREAN — Match speech level (반말/해요체/합쇼체) to relationship and status. Preserve honorifics (씨/님/선배/후배). Use 「」 or " " for quotes, natural Korean punctuation. Space words correctly (띄어쓰기). Match gendered speech patterns of the speaker.`,
  zh: `SIMPLIFIED CHINESE (zh-CN) — Use Mainland vocabulary and 简体 characters ONLY. Full-width punctuation: ，。！？：；""''《》（）. No space between CJK characters. Numbers half-width unless literary. Match register (口语/书面语) to scene.`,
  "zh-hant": `TRADITIONAL CHINESE (zh-TW) — Use Taiwan vocabulary and 繁體 characters ONLY (e.g. 資訊 not 信息, 影片 not 视频). Full-width punctuation ，。！？：；「」『』（）. Never mix Simplified glyphs.`,
  yue: `CANTONESE — Use written Cantonese (粵文) with 冇/嘅/嚟/喺/佢 etc. when the source is colloquial; otherwise standard 書面語. Full-width punctuation.`,
  th: `THAI — No spaces between words within a phrase; spaces mark clause/sentence breaks. Match register (สุภาพ/กันเอง). Preserve ครับ/ค่ะ speaker markers.`,
  vi: `VIETNAMESE — Full diacritics ALWAYS (á à ả ã ạ …). Match pronoun system to relationship (tôi/mình/tao/tớ, anh/chị/em/bạn). No spaces before punctuation.`,
  ar: `ARABIC — Right-to-left. Use Arabic punctuation ، ؛ ؟ (not , ; ?). Modern Standard Arabic unless source is clearly dialectal. Preserve diacritics only where source has them. Numbers: Western (0-9) by default. Keep Latin proper nouns LTR-embedded correctly.`,
  he: `HEBREW — Right-to-left. Use Hebrew punctuation. Match gendered verb/adjective forms to the speaker AND addressee. Modern Israeli Hebrew unless source dictates otherwise.`,
  fa: `PERSIAN/FARSI — Right-to-left. Persian punctuation ، ؛ ؟. Use ی and ک (Persian) not ي and ك (Arabic). Match ta'arof register when the scene calls for it.`,
  ur: `URDU — Right-to-left, Nastaliq script. Persian punctuation. Match honorifics (آپ/تم/تُو).`,
  ru: `RUSSIAN — Match ты/вы to relationship. Correct case endings (nom/gen/dat/acc/instr/prep) and verbal aspect (perfective/imperfective). Use « » for quotes, — for dialogue dashes.`,
  uk: `UKRAINIAN — Modern Ukrainian orthography. Match ти/ви. Use « » quotes. Do NOT russify vocabulary.`,
  de: `GERMAN — Match du/Sie precisely to relationship. Compound nouns capitalized. Use „ " quotes. Correct case (Nom/Akk/Dat/Gen) and V2 word order.`,
  fr: `FRENCH — Match tu/vous precisely. Non-breaking spaces before : ; ! ? and inside « » guillemets. Correct gender agreement on adjectives/past participles. Elide (l', d', j', qu') where required.`,
  es: `SPANISH — Match tú/usted/vos to region and relationship. Opening ¿ ¡ REQUIRED before questions/exclamations. Correct gender/number agreement. Use « » or " " per regional norm.`,
  "pt-br": `PORTUGUESE (BRAZIL) — Brazilian vocabulary and grammar (você, gerúndio). Never use tu unless the scene is regional. Post-1990 orthographic agreement.`,
  "pt-pt": `PORTUGUESE (PORTUGAL) — European Portuguese vocabulary (tu + você, infinitivo pessoal, ecrã/comboio/autocarro). Never Brazilianisms.`,
  it: `ITALIAN — Match tu/Lei/voi. Correct gender/number agreement on adjectives and past participles. Use « » or " " quotes.`,
  nl: `DUTCH — Match je/u. Correct de/het article and adjective inflection. Compound nouns written as one word.`,
  pl: `POLISH — Correct seven cases and aspect. Match ty/pan/pani/państwo. Gendered past-tense verbs must match speaker.`,
  tr: `TURKISH — Vowel harmony strict. Agglutinative suffixes attached correctly. Match sen/siz.`,
  hi: `HINDI — Devanagari script. Match तू/तुम/आप to relationship. Correct gender agreement on verbs and adjectives. Preserve English loanwords when natural (Bollywood-style code-mixing OK when source is casual).`,
  bn: `BENGALI — Match তুই/তুমি/আপনি. Correct verb conjugation for relationship. Bengali punctuation ।`,
  ta: `TAMIL — Match நீ/நீங்கள். Preserve honorifics. Correct verb agreement (person/gender/number).`,
  te: `TELUGU — Match నువ్వు/మీరు. Correct verb agreement.`,
  mr: `MARATHI — Match तू/तुम्ही/आपण. Correct gender agreement.`,
  gu: `GUJARATI — Match તું/તમે. Correct gender agreement.`,
  pa: `PUNJABI — Match ਤੂੰ/ਤੁਸੀਂ. Preserve honorifics.`,
  id: `INDONESIAN — Match aku/saya, kamu/Anda/kalian to register. No verb conjugation but tense particles matter (sudah/sedang/akan). Prefer natural everyday phrasing.`,
  ms: `MALAY — Match aku/saya, kau/awak/anda. Standard Malaysian orthography.`,
  el: `GREEK — Match εσύ/εσείς. Correct case and gender agreement. Modern Greek monotonic.`,
  cs: `CZECH — Correct seven cases and gendered past-tense. Match ty/vy.`,
  sk: `SLOVAK — Correct case and gendered past-tense. Match ty/vy.`,
  hr: `CROATIAN — Correct case and gendered agreement. Match ti/vi. Ijekavian standard.`,
  sr: `SERBIAN — Latin or Cyrillic per source; do not switch script mid-line. Match ти/ви. Correct case.`,
  ro: `ROMANIAN — Match tu/dumneavoastră. Correct case and gender. Preserve diacritics ă â î ș ț.`,
  hu: `HUNGARIAN — Match te/ön/maga. Vowel harmony. Definite vs indefinite conjugation.`,
  fi: `FINNISH — Correct 15 cases. Match sinä/te. Consonant gradation.`,
  sv: `SWEDISH — Match du/ni. Correct en/ett gender. Use " " quotes.`,
  no: `NORWEGIAN — Match du/dere. Bokmål unless source clearly Nynorsk.`,
  nb: `NORWEGIAN BOKMÅL — Bokmål orthography only.`,
  da: `DANISH — Match du/De. Danish orthography (æ ø å).`,
  is: `ICELANDIC — Correct four cases and gendered agreement. Preserve þ ð.`,
};

function langRulesFor(target: string): string {
  const key = target.toLowerCase();
  const rule = LANG_RULES[key] ?? LANG_RULES[key.split("-")[0]];
  return rule ? `\n\nTARGET-LANGUAGE RULES (${target}):\n- ${rule}` : "";
}

const SYSTEM = (s: string, t: string, glossary?: GlossaryEntry[], preset?: StylePresetId) => {
  const isHinglish = t === "hi-Latn" || t.toLowerCase() === "hinglish";
  const gloss = glossary && glossary.length
    ? `\n\nMANDATORY GLOSSARY — these source terms MUST be translated EXACTLY as specified (preserve casing where the source preserves it; never paraphrase, never invent alternatives):\n${glossary
        .slice(0, 200)
        .map((g) => `- "${g.term}" → "${g.translation}"`)
        .join("\n")}`
    : "";
  const style = stylePresetPrompt(preset);
  if (isHinglish) {
    return `You are translating subtitle cues ${s === "auto" ? "(auto-detect the source language)" : `from ${s}`} to Hinglish.\n\n${HINGLISH_RULES}${style}${gloss}`;
  }
  const langRules = langRulesFor(t);
  const base = `You are translating subtitle cues ${s === "auto" ? "(auto-detect the source language)" : `from ${s}`} to ${t}.\n\n${PRO_RULES}${langRules}${style}\n\nReturn STRICT JSON ONLY: {"translations": string[]} — same length and order as the input cues array. No prose, no markdown, no code fences. The "context_before" and "context_after" arrays (if present) are READ-ONLY scene context — do NOT translate or include them in your output.${gloss}`;
  return base;
};

/** User message payload — includes optional context arrays for scene awareness. */
function userPayload(p: DispatchParams): string {
  const payload: Record<string, unknown> = { cues: p.cues };
  if (p.contextBefore && p.contextBefore.length) payload.context_before = p.contextBefore;
  if (p.contextAfter && p.contextAfter.length) payload.context_after = p.contextAfter;
  return JSON.stringify(payload);
}

/** Deterministic post-pass: enforce glossary literal replacements after the model returns. */
function applyGlossary(out: string[], glossary?: GlossaryEntry[]): string[] {
  if (!glossary?.length) return out;
  return out.map((line) => {
    let result = line;
    for (const g of glossary) {
      if (!g.term || !g.translation) continue;
      const flags = g.caseSensitive ? "g" : "gi";
      const safe = g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      try {
        result = result.replace(new RegExp(safe, flags), g.translation);
      } catch { /* ignore bad regex */ }
    }
    return result;
  });
}

/** Generic OpenAI-compatible chat-completions call. */
async function callOpenAICompat(opts: {
  endpoint: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  system: string;
  user: string;
  extraHeaders?: Record<string, string>;
}): Promise<string[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.extraHeaders ?? {}) };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  const resp = await fetch(opts.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`${opts.endpoint}: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = j.choices?.[0]?.message?.content ?? "{}";
  const parsed = safeParseJson(content);
  return parsed.translations ?? [];
}

function safeParseJson(s: string): { translations?: string[] } {
  try {
    return JSON.parse(s);
  } catch {
    // Some providers wrap JSON in code fences or prose; try to extract.
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    return {};
  }
}

/** Lovable AI Gateway (default, no user key). */
async function callLovable(p: DispatchParams): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI gateway not configured");
  const model = p.model || (p.priority ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash");
  // NOTE: Some gateway models (e.g. newer GPT-5/Gemini-3 previews) only allow
  // the default temperature and return a 400 if any value is passed. Omit it
  // entirely unless the caller explicitly set one.
  return callOpenAICompat({
    endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKey,
    model,
    temperature: p.temperature,
    system: SYSTEM(p.sourceLang, p.targetLang, p.glossary, p.stylePreset),
    user: userPayload(p),
  });
}

/** Anthropic Claude — Messages API. */
async function callClaude(p: DispatchParams): Promise<string[]> {
  if (!p.apiKey) throw new Error("Claude requires an API key");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": p.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: p.model || "claude-3-5-sonnet-latest",
      max_tokens: 8000,
      system: SYSTEM(p.sourceLang, p.targetLang, p.glossary, p.stylePreset),
      messages: [{ role: "user", content: userPayload(p) }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { content?: Array<{ text?: string }> };
  const text = j.content?.map((c) => c.text ?? "").join("") ?? "{}";
  return safeParseJson(text).translations ?? [];
}

/** Google Gemini — generateContent API. */
async function callGemini(p: DispatchParams): Promise<string[]> {
  if (!p.apiKey) throw new Error("Gemini requires an API key");
  const model = p.model || "gemini-2.0-flash";
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(p.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM(p.sourceLang, p.targetLang, p.glossary, p.stylePreset) }] },
        contents: [{ role: "user", parts: [{ text: userPayload(p) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: p.temperature ?? 0.2 },
      }),
    },
  );
  if (!resp.ok) throw new Error(`Gemini: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = j.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "{}";
  return safeParseJson(text).translations ?? [];
}

/** Azure OpenAI — deployment-based URL. */
async function callAzureOpenAI(p: DispatchParams): Promise<string[]> {
  if (!p.apiKey || !p.url || !p.model) throw new Error("Azure OpenAI requires apiKey, url and model (deployment)");
  const apiVer = p.apiVersion || "2024-08-01-preview";
  const endpoint = `${p.url.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(p.model)}/chat/completions?api-version=${encodeURIComponent(apiVer)}`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": p.apiKey },
    body: JSON.stringify({
      temperature: p.temperature ?? 0.2,
      messages: [
        { role: "system", content: SYSTEM(p.sourceLang, p.targetLang, p.glossary, p.stylePreset) },
        { role: "user", content: userPayload(p) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`Azure OpenAI: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return safeParseJson(j.choices?.[0]?.message?.content ?? "{}").translations ?? [];
}

/** DeepL v2 — supports batches of strings natively. */
async function callDeepL(p: DispatchParams): Promise<string[]> {
  if (!p.apiKey) throw new Error("DeepL requires an API key");
  const endpoint = p.url || "https://api-free.deepl.com/v2/translate";
  const body = new URLSearchParams();
  for (const c of p.cues) body.append("text", c);
  body.set("target_lang", p.targetLang.toUpperCase());
  if (p.sourceLang && p.sourceLang !== "auto") body.set("source_lang", p.sourceLang.toUpperCase());
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${p.apiKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) throw new Error(`DeepL: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { translations?: Array<{ text: string }> };
  return (j.translations ?? []).map((t) => t.text);
}

/** DeepLX (free unofficial) — single-string, loop. */
async function callDeepLX(p: DispatchParams): Promise<string[]> {
  const endpoint = p.url || "https://api.deeplx.org/translate";
  const out: string[] = [];
  for (const text of p.cues) {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Some DeepLX mirrors return 403 to clients without a UA.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      body: JSON.stringify({ text, source_lang: p.sourceLang.toUpperCase(), target_lang: p.targetLang.toUpperCase() }),
    });
    if (!resp.ok) {
      if (resp.status === 403 || resp.status === 429) {
        throw new Error(`DeepLX: ${resp.status} (public mirror is rate-limiting or blocking requests — try a different endpoint URL or another provider)`);
      }
      throw new Error(`DeepLX: ${resp.status}`);
    }
    const j = (await resp.json()) as { data?: string };
    out.push(j.data ?? text);
  }
  return out;
}

/** Google Cloud Translation v2 — batch via q[] params. */
async function callGoogleMT(p: DispatchParams): Promise<string[]> {
  if (!p.apiKey) throw new Error("Google Translate requires an API key");
  const endpoint = `${p.url || "https://translation.googleapis.com/language/translate/v2"}?key=${encodeURIComponent(p.apiKey)}`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: p.cues, ...(p.sourceLang && p.sourceLang !== "auto" ? { source: p.sourceLang } : {}), target: p.targetLang, format: "text" }),
  });
  if (!resp.ok) throw new Error(`Google: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { data?: { translations?: Array<{ translatedText: string }> } };
  return (j.data?.translations ?? []).map((t) => decodeHtml(t.translatedText));
}

/** Azure Translator v3. */
async function callAzureMT(p: DispatchParams): Promise<string[]> {
  if (!p.apiKey || !p.region) throw new Error("Azure Translate requires apiKey and region");
  const endpoint = (p.url || "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0") +
    (p.sourceLang && p.sourceLang !== "auto" ? `&from=${encodeURIComponent(p.sourceLang)}` : "") +
    `&to=${encodeURIComponent(p.targetLang)}`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": p.apiKey,
      "Ocp-Apim-Subscription-Region": p.region,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(p.cues.map((text) => ({ text }))),
  });
  if (!resp.ok) throw new Error(`Azure MT: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as Array<{ translations?: Array<{ text: string }> }>;
  return j.map((row) => row.translations?.[0]?.text ?? "");
}

/** GTX free Google — supports translate-pa (batch) and legacy gtx (per-cue). */
async function callGTX(p: DispatchParams): Promise<string[]> {
  const endpoint = p.url || "https://translate-pa.googleapis.com/v1/translateHtml";
  // translate-pa: batched, protobuf-flavoured JSON, uses a public API key.
  if (endpoint.includes("translate-pa.googleapis.com")) {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json+protobuf",
        // Key lives only in the encrypted secret store; other engines take over if absent.
        "X-Goog-API-Key": process.env.GTX_GOOGLE_API_KEY ?? "",
      },
      body: JSON.stringify([[p.cues, p.sourceLang || "auto", p.targetLang], "te_lib"]),
    });
    if (!resp.ok) throw new Error(`GTX (translate-pa): ${resp.status} ${(await resp.text()).slice(0, 200)}`);
    const j = (await resp.json()) as [string[], string[]] | string[][];
    const arr = Array.isArray(j?.[0]) ? (j[0] as string[]) : (j as unknown as string[]);
    return p.cues.map((_, i) => decodeHtml(arr[i] ?? ""));
  }
  // Legacy gtx: one request per cue.
  const out: string[] = [];
  for (const text of p.cues) {
    const url = `${endpoint}?client=gtx&sl=${encodeURIComponent(p.sourceLang)}&tl=${encodeURIComponent(p.targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`GTX: ${resp.status}`);
    const j = (await resp.json()) as Array<Array<Array<string>>>;
    out.push(decodeHtml((j?.[0] ?? []).map((seg) => seg?.[0] ?? "").join("")));
  }
  return out;
}

/**
 * Microsoft Edge "free" translator. The Edge browser's built-in page
 * translator fetches a short-lived JWT from edge.microsoft.com and then
 * calls the public Cognitive Services translator endpoint with it as a
 * bearer token — no Azure subscription required. We mirror that flow.
 */
let edgeAuthCache: { token: string; exp: number } | null = null;
async function getEdgeAuthToken(): Promise<string> {
  const now = Date.now();
  if (edgeAuthCache && edgeAuthCache.exp - 60_000 > now) return edgeAuthCache.token;
  const resp = await fetch("https://edge.microsoft.com/translate/auth", {
    headers: {
      // Edge auth endpoint rejects requests without a browser-like UA (400).
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
      Accept: "*/*",
    },
  });
  if (!resp.ok) throw new Error(`Edge auth: ${resp.status} (free Microsoft Edge translator token endpoint blocked the request — try again later or use another provider)`);
  const token = (await resp.text()).trim();
  // Tokens are JWTs valid ~10 minutes; cache for 8.
  edgeAuthCache = { token, exp: now + 8 * 60_000 };
  return token;
}

async function callEdge(p: DispatchParams): Promise<string[]> {
  if (!p.cues.length) return [];
  const token = await getEdgeAuthToken();
  const base = p.url || "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";
  const endpoint = base +
    (p.sourceLang && p.sourceLang !== "auto" ? `&from=${encodeURIComponent(p.sourceLang)}` : "") +
    `&to=${encodeURIComponent(p.targetLang)}`;
  // Translator v3 accepts up to 1000 items / 50k chars per request; chunk to be safe.
  const out: string[] = [];
  const CHUNK = 50;
  for (let i = 0; i < p.cues.length; i += CHUNK) {
    const slice = p.cues.slice(i, i + CHUNK);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slice.map((text) => ({ text }))),
    });
    if (!resp.ok) throw new Error(`Edge: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
    const j = (await resp.json()) as Array<{ translations?: Array<{ text: string }> }>;
    for (let k = 0; k < slice.length; k++) {
      out.push(j[k]?.translations?.[0]?.text ?? slice[k]);
    }
  }
  return out;
}



// Named HTML entities we want to map back to characters. Kept intentionally
// small — covers everything GTX / Google MT actually emit in practice.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
  laquo: "«", raquo: "»", middot: "·", bull: "•", deg: "°",
  iexcl: "¡", iquest: "¿", pound: "£", euro: "€", yen: "¥", cent: "¢",
};

/**
 * Robustly decode HTML/entities from MT providers (GTX especially).
 * - Strips known wrapper/markup tags (i, b, em, strong, span, font, u, s, sub, sup, br, p, div, mark, small)
 *   while preserving inner text.
 * - Removes any other stray tags rather than letting them render as HTML.
 * - Decodes numeric (decimal + hex) and a wide set of named entities.
 * - Idempotent: safe to run twice; collapses double-encoded `&amp;lt;`.
 */
export function decodeHtml(s: string | null | undefined): string {
  if (!s) return "";

  // Tags whose ENTIRE element (open tag + contents + close tag) must be removed
  // — keeping inner text would leak `javascript:` URLs, scripts, or CSS.
  const DANGEROUS_BLOCK =
    /<(script|style|iframe|object|embed|svg|math|template|noscript|xmp|noembed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  // Self-closing or unterminated dangerous tags — drop the open tag too.
  const DANGEROUS_OPEN =
    /<\/?(script|style|iframe|object|embed|svg|math|template|noscript|xmp|noembed|img|input|link|meta|base|form|button|video|audio|source|track|a)\b[^>]*>?/gi;

  // Inline event handlers / javascript: URLs that survived inside text.
  const stripDangerousText = (input: string): string =>
    input
      .replace(/\bon[a-zA-Z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/\bon[a-zA-Z]+\s*=\s*'[^']*'/gi, "")
      .replace(/\bon[a-zA-Z]+\s*=\s*[^\s>]+/gi, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/data\s*:\s*text\/html/gi, "");

  const decodeOnce = (input: string): string =>
    input
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
        const cp = parseInt(n, 16);
        return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : "";
      })
      .replace(/&#(\d+);/g, (_, n) => {
        const cp = Number(n);
        return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : "";
      })
      .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name: string) => {
        const v = NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()];
        return v ?? m;
      })
      .replace(/&amp;/g, "&");

  const sanitize = (input: string): string => {
    let out = input;
    // <br> → newline before any tag stripping.
    out = out.replace(/<br\s*\/?\s*>/gi, "\n");
    // Remove dangerous elements with their full contents (run a few times for
    // nesting / overlapping matches).
    for (let i = 0; i < 3; i++) {
      const before = out;
      out = out.replace(DANGEROUS_BLOCK, "");
      if (out === before) break;
    }
    out = out.replace(DANGEROUS_OPEN, "");
    // Strip any remaining HTML-shaped tag (must start with a letter or `/letter`)
    // — leaves bare `<` / `>` used as math/comparison operators intact.
    out = out.replace(/<\/?[a-zA-Z][^>]*>/g, "");
    // Defensive: also strip event-handler / javascript: residue in text.
    out = stripDangerousText(out);
    return out;
  };

  // Sanitize → decode entities → sanitize again (catches `&lt;script&gt;`
  // payloads that only become live markup after decoding). Repeat until stable.
  let out = sanitize(s);
  for (let i = 0; i < 3; i++) {
    const decoded = decodeOnce(out);
    const cleaned = sanitize(decoded);
    if (cleaned === out) break;
    out = cleaned;
  }
  return out;
}

async function dispatchRaw(p: DispatchParams): Promise<string[]> {
  const spec = getProvider(p.providerId);
  if (!spec) throw new Error(`Unknown provider: ${p.providerId}`);
  if (!spec.implemented) throw new Error(`${spec.label} is registered but not yet implemented in SubtitleOS`);

  const mtProviders = new Set(["deepl", "deeplx", "google", "azure", "gtxFreeAPI", "edgeFreeAPI", "mymemory", "libretranslate"]);
  if (p.targetLang === "hi-Latn" && mtProviders.has(p.providerId)) {
    throw new Error(`${spec.label} cannot output Hinglish (Roman-script Hindi). Please pick an LLM provider (Lovable, OpenAI, Claude, Gemini, etc.) for Hinglish translation.`);
  }

  // Standalone mode: no AI gateway key configured → use the free keyless
  // machine-translation providers instead of failing outright.
  if (p.providerId === "lovable" && !process.env.LOVABLE_API_KEY) {
    if (p.targetLang === "hi-Latn") {
      throw new Error(
        "Hinglish needs an AI provider. Add your own API key (OpenAI/Gemini/Claude/…) in Settings → Providers.",
      );
    }
    try {
      return await callGTX(p);
    } catch {
      return await callEdge(p);
    }
  }

  switch (p.providerId) {
    case "lovable": return callLovable(p);
    case "claude": return callClaude(p);
    case "gemini": return callGemini(p);
    case "azureopenai": return callAzureOpenAI(p);
    case "deepl": return callDeepL(p);
    case "deeplx": return callDeepLX(p);
    case "google": return callGoogleMT(p);
    case "azure": return callAzureMT(p);
    case "gtxFreeAPI": return callGTX(p);
    case "edgeFreeAPI": return callEdge(p);
    case "mymemory": return (await callMyMemory(p)).map(decodeHtml);
    case "libretranslate": return (await callLibreTranslate(p)).map(decodeHtml);
  }

  if (spec.kind === "openai-compat") {
    return callOpenAICompat({
      endpoint: p.url || spec.endpoint,
      apiKey: p.apiKey,
      model: p.model || spec.defaultModel,
      temperature: p.temperature ?? spec.defaultTemperature,
      system: SYSTEM(p.sourceLang, p.targetLang, p.glossary, p.stylePreset),
      user: userPayload(p),
      extraHeaders: spec.extraHeaders,
    });
  }

  throw new Error(`${spec.label}: dispatcher missing`);
}

// Providers that go through an LLM and benefit from cue chunking
// (avoids long single-shot calls that hang or hit token limits).
const LLM_PROVIDER_IDS = new Set([
  "lovable", "claude", "gemini", "azureopenai",
  "openai", "deepseek", "qwen", "qwenMt", "moonshot", "doubao", "mimo",
  "zhipu", "minimax", "qianfan", "hunyuan", "mistral", "grok", "perplexity",
  "cohere", "yandex", "alice", "openrouter", "groq", "siliconflow", "github",
  "nvidia", "litellm", "llm", "lmstudio", "ollama", "llamacpp", "translategemma",
]);

function chunkCues(cues: string[], maxCues: number, maxChars: number): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let curChars = 0;
  for (const c of cues) {
    const len = (c?.length ?? 0) + 2;
    if (cur.length && (cur.length >= maxCues || curChars + len > maxChars)) {
      chunks.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(c);
    curChars += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const MT_ONLY_PROVIDER_IDS = new Set(["deepl", "deeplx", "google", "azure", "gtxFreeAPI", "edgeFreeAPI", "mymemory", "libretranslate"]);

/**
 * Pro-polish pass: rewrite raw MT output into natural professional subtitle
 * dialogue using Lovable AI. Preserves count & order; falls back to raw MT
 * on any failure so translation never fails just because polish failed.
 */
async function polishMT(
  p: DispatchParams,
  source: string[],
  mt: string[],
): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !mt.length) return mt;
  const CHUNK = 25;
  const out: string[] = [];
  for (let i = 0; i < mt.length; i += CHUNK) {
    const src = source.slice(i, i + CHUNK);
    const draft = mt.slice(i, i + CHUNK);
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                SYSTEM(p.sourceLang, p.targetLang, p.glossary, p.stylePreset) +
                `\n\nYou are POLISHING an existing machine translation, not translating from scratch. For each item you receive a {source, draft}. Rewrite "draft" as natural, professional, publication-ready ${p.targetLang} dialogue faithful to "source". Fix literal machine-translation phrasing, awkward grammar, wrong register, wrong pronouns/honorifics, and unnatural word order. Preserve meaning, tone, formatting markers, proper nouns, numbers and line breaks EXACTLY. Return STRICT JSON: {"translations": string[]} in the same order and length as input.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                pairs: src.map((s, k) => ({ source: s, draft: draft[k] ?? "" })),
              }),
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) throw new Error(`polish ${resp.status}`);
      const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const parsed = safeParseJson(j.choices?.[0]?.message?.content ?? "{}");
      const arr = parsed.translations ?? [];
      for (let k = 0; k < draft.length; k++) {
        const v = (arr[k] ?? "").trim();
        out.push(v || draft[k]);
      }
    } catch {
      // Polish is best-effort — fall back to raw MT for this chunk.
      out.push(...draft);
    }
  }
  return out;
}

export async function dispatch(p: DispatchParams): Promise<string[]> {
  let translated: string[];
  // For LLM providers with many cues, split into smaller batches so each
  // request stays within Worker CPU/time limits and the model's token budget.
  // Hinglish + large SRT used to hang as a single all-at-once call.
  if (LLM_PROVIDER_IDS.has(p.providerId) && p.cues.length > 25) {
    const chunks = chunkCues(p.cues, 25, 6000);
    const out: string[] = [];
    let cursor = 0;
    const CTX = 2; // scene-aware: 2 cues before + after each chunk
    for (const chunk of chunks) {
      const before = p.cues.slice(Math.max(0, cursor - CTX), cursor);
      const after = p.cues.slice(cursor + chunk.length, cursor + chunk.length + CTX);
      let res = await dispatchRaw({
        ...p,
        cues: chunk,
        contextBefore: [...(p.contextBefore ?? []), ...before].slice(-CTX),
        contextAfter: [...after, ...(p.contextAfter ?? [])].slice(0, CTX),
      });
      if (res.length < chunk.length) res = [...res, ...chunk.slice(res.length)];
      else if (res.length > chunk.length) res = res.slice(0, chunk.length);
      out.push(...res);
      cursor += chunk.length;
    }
    translated = out;
  } else {
    translated = await dispatchRaw(p);
  }
  // Post-pass: professional polish for MT-only providers when requested.
  if (p.proPolish && MT_ONLY_PROVIDER_IDS.has(p.providerId)) {
    translated = await polishMT(p, p.cues, translated);
  }
  return applyGlossary(translated, p.glossary);
}

export function defaultModelFor(providerId: string): string | undefined {
  const spec = getProvider(providerId);
  if (!spec) return undefined;
  if (spec.kind === "openai-compat") return spec.defaultModel;
  return (spec as { defaults?: { model?: string } }).defaults?.model;
}

// ---------------------------------------------------------------------------
// Generic provider-aware JSON chat call.
// Used by the "AI cleanup" (polish) pass so it honours the user's chosen
// translation provider/key/model instead of always defaulting to Lovable AI.
// Falls back to the Lovable gateway for MT-only providers (DeepL/GTX/Edge/…)
// which cannot run a free-form editing prompt.
// ---------------------------------------------------------------------------
export type ChatProviderCfg = {
  providerId?: string;
  apiKey?: string;
  url?: string;
  model?: string;
  apiVersion?: string;
};

function pickJsonArray(parsed: Record<string, unknown>, key: string): string[] {
  const direct = parsed[key];
  if (Array.isArray(direct)) return direct.map((v) => (typeof v === "string" ? v : ""));
  for (const v of Object.values(parsed)) {
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : ""));
  }
  return [];
}

function parseLoose(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* fall through */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* ignore */ } }
  return {};
}

async function lovableChat(system: string, user: string, model?: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI gateway not configured");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || "google/gemini-2.5-flash",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`AI cleanup failed: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "{}";
}

/** Run a JSON-returning chat prompt against the caller's chosen provider. */
export async function chatJsonArray(
  cfg: ChatProviderCfg,
  system: string,
  user: string,
  key = "cues",
): Promise<string[]> {
  const id = cfg.providerId;
  const spec = id ? getProvider(id) : undefined;
  const llmCapable = !!spec && spec.implemented && spec.category === "llm";

  let content: string;
  if (!id || id === "lovable" || !llmCapable) {
    // MT-only / unknown provider → the gateway does the editing pass.
    content = await lovableChat(system, user, id === "lovable" ? cfg.model : undefined);
  } else if (id === "claude") {
    if (!cfg.apiKey) throw new Error("Claude requires an API key");
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: cfg.model || "claude-3-5-sonnet-latest",
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!resp.ok) throw new Error(`Claude: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
    const j = (await resp.json()) as { content?: Array<{ text?: string }> };
    content = j.content?.map((c) => c.text ?? "").join("") ?? "{}";
  } else if (id === "gemini") {
    if (!cfg.apiKey) throw new Error("Gemini requires an API key");
    const model = cfg.model || "gemini-2.0-flash";
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
    if (!resp.ok) throw new Error(`Gemini: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
    const j = (await resp.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    content = j.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "{}";
  } else {
    // OpenAI-compatible (hosted or self-hosted/custom URL).
    const endpoint =
      cfg.url?.trim()
        ? (id === "azureopenai"
            ? `${cfg.url.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(cfg.model || "gpt-4o-mini")}/chat/completions?api-version=${encodeURIComponent(cfg.apiVersion || "2024-08-01-preview")}`
            : cfg.url.trim())
        : (spec.kind === "openai-compat" ? spec.endpoint : (spec as { defaults?: { url?: string } }).defaults?.url ?? "");
    if (!endpoint) throw new Error(`${spec.label}: no endpoint configured for AI cleanup`);
    assertSafeExternalUrl(endpoint);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (spec.kind === "openai-compat" && spec.extraHeaders) Object.assign(headers, spec.extraHeaders);
    if (cfg.apiKey) {
      if (id === "azureopenai") headers["api-key"] = cfg.apiKey;
      else headers.Authorization = `Bearer ${cfg.apiKey}`;
    }
    const model = cfg.model || (spec.kind === "openai-compat" ? spec.defaultModel : (spec as { defaults?: { model?: string } }).defaults?.model) || "gpt-4o-mini";
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) throw new Error(`${spec.label}: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    content = j.choices?.[0]?.message?.content ?? "{}";
  }

  return pickJsonArray(parseLoose(content), key);
}
