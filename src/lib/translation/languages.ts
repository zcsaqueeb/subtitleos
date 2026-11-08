export type Lang = { code: string; name: string; native: string };
export const LANGUAGES: Lang[] = [
    { code: "auto", name: "Auto", native: "Auto" },
    { code: "multi", name: "Multi-language (mixed)", native: "Multi-language" },
    { code: "en", name: "English", native: "English" },
    { code: "zh", name: "Simplified Chinese", native: "简体" },
    { code: "zh-hant", name: "Traditional Chinese", native: "繁體" },
    { code: "es", name: "Spanish", native: "Español" },
    { code: "fr", name: "French", native: "Français" },
    { code: "de", name: "German", native: "Deutsch" },
    { code: "ja", name: "Japanese", native: "日本語" },
    { code: "ko", name: "Korean", native: "한국어" },
    { code: "hi", name: "Hindi", native: "हिन्दी" },
    { code: "hi-Latn", name: "Hinglish (Professional)", native: "Hinglish" },
    { code: "ar", name: "Arabic", native: "العربية" },
    { code: "ru", name: "Russian", native: "Русский" },
    { code: "pt-br", name: "Portuguese (Brazil)", native: "Português (Brasil)" },
    { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
    { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
    { code: "it", name: "Italian", native: "Italiano" },
    { code: "yue", name: "Cantonese", native: "粵語" },
    { code: "pl", name: "Polish", native: "Polski" },
    { code: "uk", name: "Ukrainian", native: "Українська" },
    { code: "nl", name: "Dutch", native: "Nederlands" },
    { code: "ro", name: "Romanian", native: "Română" },
    { code: "el", name: "Greek", native: "Ελληνικά" },
    { code: "hu", name: "Hungarian", native: "Magyar" },
    { code: "sv", name: "Swedish", native: "Svenska" },
    { code: "cs", name: "Czech", native: "Čeština" },
    { code: "pt-pt", name: "Portuguese (Portugal)", native: "Português (Portugal)" },
    { code: "ca", name: "Catalan", native: "Català" },
    { code: "sr", name: "Serbian", native: "Српски" },
    { code: "bg", name: "Bulgarian", native: "Български" },
    { code: "hy", name: "Armenian", native: "Հայերեն" },
    { code: "da", name: "Danish", native: "Dansk" },
    { code: "sq", name: "Albanian", native: "Shqip" },
    { code: "fi", name: "Finnish", native: "Suomi" },
    { code: "nb", name: "Norwegian Bokmål", native: "Norsk bokmål" },
    { code: "sk", name: "Slovak", native: "Slovenčina" },
    { code: "hr", name: "Croatian", native: "Hrvatski" },
    { code: "be", name: "Belarusian", native: "Беларуская" },
    { code: "scn", name: "Sicilian", native: "Sicilianu" },
    { code: "ka", name: "Georgian", native: "ქართული" },
    { code: "lmo", name: "Lombard", native: "Lombard" },
    { code: "lt", name: "Lithuanian", native: "Lietuvių" },
    { code: "gl", name: "Galician", native: "Galego" },
    { code: "bs", name: "Bosnian", native: "Bosanski" },
    { code: "sl", name: "Slovenian", native: "Slovenščina" },
    { code: "mk", name: "Macedonian", native: "Македонски" },
    { code: "lv", name: "Latvian", native: "Latviešu" },
    { code: "et", name: "Estonian", native: "Eesti" },
    { code: "is", name: "Icelandic", native: "Íslenska" },
    { code: "mt", name: "Maltese", native: "Malti" },
    { code: "cy", name: "Welsh", native: "Cymraeg" },
    { code: "ga", name: "Irish", native: "Gaeilge" },
    { code: "br", name: "Breton", native: "Brezhoneg" },
    { code: "eu", name: "Basque", native: "Euskara" },
    { code: "yi", name: "Yiddish", native: "ייִדיש" },
    { code: "lb", name: "Luxembourgish", native: "Lëtzebuergesch" },
    { code: "oc", name: "Occitan", native: "Occitan" },
    { code: "an", name: "Aragonese", native: "Aragonés" },
    { code: "la", name: "Latin", native: "Latina" },
    { code: "eo", name: "Esperanto", native: "Esperanto" },
    { code: "tr", name: "Turkish", native: "Türkçe" },
    { code: "he", name: "Hebrew", native: "עברית" },
    { code: "fa", name: "Persian", native: "فارسی" },
    { code: "ur", name: "Urdu", native: "اردو" },
    { code: "ps", name: "Pashto", native: "پښتو" },
    { code: "prs", name: "Dari", native: "دری" },
    { code: "ckb", name: "Central Kurdish", native: "کوردی" },
    { code: "kmr", name: "Northern Kurdish", native: "Kurdî" },
    { code: "uz", name: "Uzbek", native: "Oʻzbekcha" },
    { code: "kk", name: "Kazakh", native: "Қазақ тілі" },
    { code: "ky", name: "Kyrgyz", native: "Кыргызча" },
    { code: "tk", name: "Turkmen", native: "Türkmençe" },
    { code: "az", name: "Azerbaijani", native: "Azərbaycan" },
    { code: "tg", name: "Tajik", native: "Тоҷикӣ" },
    { code: "mn", name: "Mongolian", native: "Монгол" },
    { code: "ba", name: "Bashkir", native: "Башҡортса" },
    { code: "tt", name: "Tatar", native: "Татар теле" },
    { code: "ug", name: "Uyghur", native: "ئۇيغۇرچە" },
    { code: "bn", name: "Bengali", native: "বাংলা" },
    { code: "mr", name: "Marathi", native: "मराठी" },
    { code: "te", name: "Telugu", native: "తెలుగు" },
    { code: "ta", name: "Tamil", native: "தமிழ்" },
    { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
    { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
    { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
    { code: "ml", name: "Malayalam", native: "മലയാളം" },
    { code: "bho", name: "Bhojpuri", native: "भोजपुरी" },
    { code: "mai", name: "Maithili", native: "मैथिली" },
    { code: "ne", name: "Nepali", native: "नेपाली" },
    { code: "si", name: "Sinhala", native: "සිංහල" },
    { code: "as", name: "Assamese", native: "অসমীয়া" },
    { code: "gom", name: "Konkani", native: "कोंकणी" },
    { code: "sa", name: "Sanskrit", native: "संस्कृतम्" },
    { code: "th", name: "Thai", native: "ไทย" },
    { code: "lo", name: "Lao", native: "ລາວ" },
    { code: "my", name: "Burmese", native: "မြန်မာ" },
    { code: "ms", name: "Malay", native: "Bahasa Melayu" },
    { code: "fil", name: "Filipino(Tagalog)", native: "Tagalog" },
    { code: "jv", name: "Javanese", native: "Basa Jawa" },
    { code: "su", name: "Sundanese", native: "Basa Sunda" },
    { code: "ace", name: "Acehnese", native: "Acèh" },
    { code: "pag", name: "Pangasinan", native: "Salitan Pangasinan" },
    { code: "pam", name: "Pampangan", native: "Kapampangan" },
    { code: "ceb", name: "Cebuano", native: "Cebuano" },
    { code: "sw", name: "Swahili", native: "Kiswahili" },
    { code: "ha", name: "Hausa", native: "هَرْشٜىٰن هَوْسَا" },
    { code: "am", name: "Amharic", native: "አማርኛ" },
    { code: "ig", name: "Igbo", native: "Igbo" },
    { code: "wo", name: "Wolof", native: "Wolof" },
    { code: "xh", name: "Xhosa", native: "isiXhosa" },
    { code: "zu", name: "Zulu", native: "isiZulu" },
    { code: "af", name: "Afrikaans", native: "Afrikaans" },
    { code: "om", name: "Oromo", native: "Afaan Oromoo" },
    { code: "st", name: "Southern Sotho", native: "Sesotho" },
    { code: "tn", name: "Tswana", native: "Setswana" },
    { code: "ts", name: "Tsonga", native: "Xitsonga" },
    { code: "mg", name: "Malagasy", native: "Malagasy" },
    { code: "ln", name: "Lingala", native: "Lingála" },
    { code: "ht", name: "Haitian Creole", native: "Kreyòl ayisyen" },
    { code: "qu", name: "Quechua", native: "Runa Simi" },
    { code: "ay", name: "Aymara", native: "Aymar aru" },
    { code: "gn", name: "Guarani", native: "Avañe'ẽ" },
    { code: "mi", name: "Maori", native: "Māori" },
];

// Flag emoji per language code (best-guess country). Falls back to 🌐.
export const LANG_FLAGS: Record<string, string> = {
  auto: "🌐", en: "🇬🇧", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹",
  "pt-br": "🇧🇷", "pt-pt": "🇵🇹", pt: "🇵🇹", ru: "🇷🇺", ja: "🇯🇵", ko: "🇰🇷",
  zh: "🇨🇳", "zh-hant": "🇹🇼", yue: "🇭🇰", ar: "🇸🇦", hi: "🇮🇳", "hi-Latn": "🇮🇳", ur: "🇵🇰",
  tr: "🇹🇷", pl: "🇵🇱", nl: "🇳🇱", sv: "🇸🇪", vi: "🇻🇳", th: "🇹🇭",
  he: "🇮🇱", id: "🇮🇩", uk: "🇺🇦", ro: "🇷🇴", el: "🇬🇷", hu: "🇭🇺",
  cs: "🇨🇿", da: "🇩🇰", fi: "🇫🇮", nb: "🇳🇴", no: "🇳🇴", sk: "🇸🇰",
  hr: "🇭🇷", bg: "🇧🇬", sr: "🇷🇸", sl: "🇸🇮", lt: "🇱🇹", lv: "🇱🇻",
  et: "🇪🇪", is: "🇮🇸", mt: "🇲🇹", cy: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", ga: "🇮🇪", eu: "🏴",
  ca: "🏴", gl: "🏴", fa: "🇮🇷", bn: "🇧🇩", ta: "🇮🇳", te: "🇮🇳",
  ml: "🇮🇳", mr: "🇮🇳", gu: "🇮🇳", pa: "🇮🇳", kn: "🇮🇳", si: "🇱🇰",
  ne: "🇳🇵", my: "🇲🇲", km: "🇰🇭", lo: "🇱🇦", ms: "🇲🇾", tl: "🇵🇭",
  sw: "🇰🇪", am: "🇪🇹", ha: "🇳🇬", yo: "🇳🇬", ig: "🇳🇬", zu: "🇿🇦",
  af: "🇿🇦", xh: "🇿🇦", so: "🇸🇴", mg: "🇲🇬", uz: "🇺🇿", kk: "🇰🇿",
  ky: "🇰🇬", tk: "🇹🇲", tg: "🇹🇯", mn: "🇲🇳", az: "🇦🇿", hy: "🇦🇲",
  ka: "🇬🇪", be: "🇧🇾", mk: "🇲🇰", bs: "🇧🇦", sq: "🇦🇱", lb: "🇱🇺",
  mi: "🇳🇿", sm: "🇼🇸", to: "🇹🇴", fj: "🇫🇯", haw: "🇺🇸", la: "🇻🇦",
  eo: "🌐", yi: "✡️",
};

export function flagFor(code: string): string {
  return LANG_FLAGS[code] ?? LANG_FLAGS[code.split("-")[0]] ?? "🌐";
}

/** Best-effort client-side language detection from sample text. */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 4000);
  // Script-based fast paths
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(sample)) return "ko";
  if (/[\u4E00-\u9FFF]/.test(sample)) return "zh";
  if (/[\u0E00-\u0E7F]/.test(sample)) return "th";
  if (/[\u0590-\u05FF]/.test(sample)) return "he";
  if (/[\u0900-\u097F]/.test(sample)) return "hi";
  if (/[\u0980-\u09FF]/.test(sample)) return "bn";
  if (/[\u0B80-\u0BFF]/.test(sample)) return "ta";
  if (/[\u0370-\u03FF]/.test(sample)) return "el";
  if (/[\u0600-\u06FF]/.test(sample)) {
    // Disambiguate Arabic / Urdu / Persian by signature characters
    if (/[ٹڈڑںھے]/.test(sample)) return "ur";
    if (/[پچژگ]/.test(sample)) return "fa";
    return "ar";
  }
  if (/[\u0400-\u04FF]/.test(sample)) {
    if (/[іїєґ]/i.test(sample)) return "uk";
    return "ru";
  }
  // Latin-script word frequency heuristic
  const lower = " " + sample.toLowerCase().replace(/[^\p{L}\s']/gu, " ") + " ";
  const score: Record<string, number> = {};
  const bumps: Array<[string, string[]]> = [
    ["en", ["the","and","you","for","with","this","that","have","are","was"]],
    ["es", ["que","los","las","una","con","por","para","esto","como","pero"]],
    ["fr", ["que","les","des","une","pour","avec","est","pas","mais","vous"]],
    ["de", ["der","die","und","ist","nicht","ein","mit","auf","von","sich"]],
    ["it", ["che","non","una","con","per","sono","della","come","questo","anche"]],
    ["pt-br", ["que","não","uma","com","para","você","está","mais","isso","como"]],
    ["nl", ["het","een","niet","van","met","voor","maar","heb","ook","wat"]],
    ["sv", ["och","att","det","som","inte","har","jag","den","var","med"]],
    ["pl", ["nie","jest","się","czy","jak","tak","tym","jego","tego","oraz"]],
    ["tr", ["bir","için","ile","değil","daha","çok","gibi","kadar","sonra","ama"]],
    ["vi", ["không","của","và","là","cho","với","được","này","để","trong"]],
    ["id", ["yang","dan","tidak","untuk","ini","itu","saya","dengan","akan","dari"]],
  ];
  for (const [code, words] of bumps) {
    let s = 0;
    for (const w of words) if (lower.includes(` ${w} `)) s++;
    score[code] = s;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 2) return best[0];
  return "en";
}
