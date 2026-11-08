// Single source of truth for translation providers in SubtitleOS.
// Categories match the canonical subtitle-translator layout:
//   Machine Translation · Local Providers · LLM Providers
// Edit PROVIDERS here and every derived view (UI list, defaults, dispatcher) follows.

export type ServiceCategory = "machine-translation" | "local" | "llm";

type BaseProvider = {
  label: string;
  description?: string;
  category: ServiceCategory;
  docs?: string;
  apiKeyUrl?: string;
  endpoints?: ReadonlyArray<{ label: string; url: string }>;
  models?: ReadonlyArray<{ label: string; value: string; thinking?: boolean }>;
  /** Provider is fully wired in the dispatcher. False = listed but not yet callable. */
  implemented: boolean;
  /** UI requires user to supply an API key for this provider. */
  requiresApiKey: boolean;
  /** UI shows a URL field (custom endpoints / self-hosted). */
  acceptsCustomUrl?: boolean;
  /** Extra fields the UI should render. */
  fields?: ReadonlyArray<"region" | "apiVersion" | "folderId">;
};

export type OpenAICompatProviderSpec = BaseProvider & {
  kind: "openai-compat";
  endpoint: string;
  defaultModel: string;
  defaultTemperature: number;
  extraHeaders?: Record<string, string>;
};

export type CustomProviderSpec = BaseProvider & {
  kind: "custom";
  defaults: {
    url?: string;
    model?: string;
    temperature?: number;
  };
};

export type ProviderSpec = OpenAICompatProviderSpec | CustomProviderSpec;

export const PROVIDERS = {
  // ===== Machine Translation =====
  gtxFreeAPI: {
    kind: "custom",
    category: "machine-translation",
    label: "GTX API (Free)",
    implemented: true,
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaults: { url: "https://translate-pa.googleapis.com/v1/translateHtml" },
    endpoints: [
      { label: "translate-pa (Default)", url: "https://translate-pa.googleapis.com/v1/translateHtml" },
      { label: "Legacy gtx", url: "https://translate.googleapis.com/translate_a/single" },
    ],
  },
  edgeFreeAPI: {
    kind: "custom",
    category: "machine-translation",
    label: "Edge API (Free)",
    implemented: true,
    requiresApiKey: false,
    defaults: { url: "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0" },
  },
  mymemory: {
    kind: "custom",
    category: "machine-translation",
    label: "MyMemory (Free)",
    description: "No account or API key required. Best for short subtitles: the free service allows about 5,000 characters per day per request IP, shared by hosted visitors. Auto source uses local language detection; select the source explicitly for short or mixed text. Text is sent to MyMemory for translation.",
    docs: "https://mymemory.translated.net/doc/spec.php",
    implemented: true,
    requiresApiKey: false,
    defaults: { url: "https://api.mymemory.translated.net/get" },
  },
  libretranslate: {
    kind: "custom",
    category: "machine-translation",
    label: "LibreTranslate (Self-hosted · Free)",
    description: "Free open-source translation with automatic source detection. Enter a reachable self-hosted or community /translate endpoint. Language support, limits and any optional key depend on that server; the official hosted service is not keyless. Hosting costs may apply.",
    docs: "https://docs.libretranslate.com/",
    implemented: true,
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaults: {},
  },
  google: {
    kind: "custom",
    category: "machine-translation",
    label: "Google Translate",
    implemented: true,
    requiresApiKey: true,
    apiKeyUrl: "https://console.cloud.google.com/apis/credentials",
    defaults: { url: "https://translation.googleapis.com/language/translate/v2" },
  },
  deepl: {
    kind: "custom",
    category: "machine-translation",
    label: "DeepL",
    implemented: true,
    requiresApiKey: true,
    acceptsCustomUrl: true,
    apiKeyUrl: "https://www.deepl.com/account/summary",
    defaults: { url: "https://api-free.deepl.com/v2/translate" },
    endpoints: [
      { label: "Free", url: "https://api-free.deepl.com/v2/translate" },
      { label: "Pro", url: "https://api.deepl.com/v2/translate" },
    ],
  },
  deeplx: {
    kind: "custom",
    category: "machine-translation",
    label: "DeepLX (Free)",
    implemented: true,
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaults: { url: "https://api.deeplx.org/translate" },
  },
  azure: {
    kind: "custom",
    category: "machine-translation",
    label: "Azure Translate",
    implemented: true,
    requiresApiKey: true,
    fields: ["region"],
    defaults: { url: "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0" },
  },
  qwenMt: {
    kind: "openai-compat",
    category: "machine-translation",
    label: "Qwen-MT",
    implemented: true,
    requiresApiKey: true,
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-mt-turbo",
    defaultTemperature: 0.2,
    apiKeyUrl: "https://dashscope.console.aliyun.com/apiKey",
  },
  translategemma: {
    kind: "openai-compat",
    category: "machine-translation",
    label: "TranslateGemma",
    implemented: true,
    requiresApiKey: false,
    acceptsCustomUrl: true,
    endpoint: "http://127.0.0.1:1234/v1/chat/completions",
    defaultModel: "google/gemma-3-translate",
    defaultTemperature: 0.2,
    endpoints: [
      { label: "LM Studio", url: "http://127.0.0.1:1234/v1/chat/completions" },
      { label: "Ollama", url: "http://127.0.0.1:11434/v1/chat/completions" },
      { label: "llama.cpp", url: "http://127.0.0.1:8080/v1/chat/completions" },
    ],
  },

  // ===== Local Providers (OpenAI-compatible, self-hosted) =====
  lmstudio: {
    kind: "openai-compat",
    category: "local",
    label: "LM Studio",
    implemented: true,
    requiresApiKey: false,
    acceptsCustomUrl: true,
    endpoint: "http://127.0.0.1:1234/v1/chat/completions",
    defaultModel: "local-model",
    defaultTemperature: 0.2,
  },
  ollama: {
    kind: "openai-compat",
    category: "local",
    label: "Ollama",
    implemented: true,
    requiresApiKey: false,
    acceptsCustomUrl: true,
    endpoint: "http://127.0.0.1:11434/v1/chat/completions",
    defaultModel: "llama3.1",
    defaultTemperature: 0.2,
  },
  llamacpp: {
    kind: "openai-compat",
    category: "local",
    label: "llama.cpp",
    implemented: true,
    requiresApiKey: false,
    acceptsCustomUrl: true,
    endpoint: "http://127.0.0.1:8080/v1/chat/completions",
    defaultModel: "local-model",
    defaultTemperature: 0.2,
  },

  // ===== LLM Providers =====
  openai: {
    kind: "openai-compat", category: "llm", label: "OpenAI", implemented: true, requiresApiKey: true,
    endpoint: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini", defaultTemperature: 0.2,
    apiKeyUrl: "https://platform.openai.com/api-keys",
    models: [
      { label: "GPT-4o mini", value: "gpt-4o-mini" },
      { label: "GPT-4o", value: "gpt-4o" },
      { label: "o4-mini", value: "o4-mini", thinking: true },
    ],
  },
  claude: {
    kind: "custom", category: "llm", label: "Claude", implemented: true, requiresApiKey: true,
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    defaults: { url: "https://api.anthropic.com/v1/messages", model: "claude-3-5-sonnet-latest", temperature: 0.2 },
  },
  gemini: {
    kind: "custom", category: "llm", label: "Gemini", implemented: true, requiresApiKey: true,
    apiKeyUrl: "https://aistudio.google.com/apikey",
    defaults: { url: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.0-flash", temperature: 0.2 },
  },
  deepseek: {
    kind: "openai-compat", category: "llm", label: "DeepSeek", implemented: true, requiresApiKey: true,
    endpoint: "https://api.deepseek.com/v1/chat/completions", defaultModel: "deepseek-chat", defaultTemperature: 0.2,
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { label: "deepseek-chat", value: "deepseek-chat" },
      { label: "deepseek-reasoner", value: "deepseek-reasoner", thinking: true },
    ],
  },
  qwen: {
    kind: "openai-compat", category: "llm", label: "Qwen", implemented: true, requiresApiKey: true,
    acceptsCustomUrl: true,
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-plus", defaultTemperature: 0.2,
    endpoints: [
      { label: "International", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions" },
      { label: "Mainland", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" },
    ],
    models: [{ label: "qwen-plus", value: "qwen-plus" }, { label: "qwen-max", value: "qwen-max" }],
  },
  moonshot: {
    kind: "openai-compat", category: "llm", label: "Moonshot (Kimi)", implemented: true, requiresApiKey: true,
    endpoint: "https://api.moonshot.cn/v1/chat/completions", defaultModel: "moonshot-v1-8k", defaultTemperature: 0.2,
  },
  doubao: {
    kind: "openai-compat", category: "llm", label: "Doubao", implemented: true, requiresApiKey: true,
    acceptsCustomUrl: true,
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    defaultModel: "doubao-pro-32k", defaultTemperature: 0.2,
  },
  mimo: {
    kind: "openai-compat", category: "llm", label: "Xiaomi MiMo", implemented: true, requiresApiKey: true,
    acceptsCustomUrl: true,
    endpoint: "https://api.xiaomi.com/v1/chat/completions",
    defaultModel: "mimo-7b", defaultTemperature: 0.2,
  },
  zhipu: {
    kind: "openai-compat", category: "llm", label: "Zhipu GLM", implemented: true, requiresApiKey: true,
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-4-flash", defaultTemperature: 0.2,
  },
  minimax: {
    kind: "openai-compat", category: "llm", label: "MiniMax", implemented: true, requiresApiKey: true,
    acceptsCustomUrl: true,
    endpoint: "https://api.minimaxi.chat/v1/text/chatcompletion_v2",
    defaultModel: "MiniMax-Text-01", defaultTemperature: 0.2,
  },
  qianfan: {
    kind: "openai-compat", category: "llm", label: "Baidu ERNIE", implemented: true, requiresApiKey: true,
    endpoint: "https://qianfan.baidubce.com/v2/chat/completions",
    defaultModel: "ernie-speed-128k", defaultTemperature: 0.2,
  },
  hunyuan: {
    kind: "openai-compat", category: "llm", label: "Tencent Hunyuan", implemented: true, requiresApiKey: true,
    endpoint: "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
    defaultModel: "hunyuan-lite", defaultTemperature: 0.2,
  },
  mistral: {
    kind: "openai-compat", category: "llm", label: "Mistral", implemented: true, requiresApiKey: true,
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "mistral-small-latest", defaultTemperature: 0.2,
    apiKeyUrl: "https://console.mistral.ai/api-keys",
  },
  grok: {
    kind: "openai-compat", category: "llm", label: "xAI (Grok)", implemented: true, requiresApiKey: true,
    endpoint: "https://api.x.ai/v1/chat/completions",
    defaultModel: "grok-2-latest", defaultTemperature: 0.2,
    apiKeyUrl: "https://console.x.ai",
  },
  perplexity: {
    kind: "openai-compat", category: "llm", label: "Perplexity", implemented: true, requiresApiKey: true,
    endpoint: "https://api.perplexity.ai/chat/completions",
    defaultModel: "sonar", defaultTemperature: 0.2,
  },
  cohere: {
    kind: "openai-compat", category: "llm", label: "Cohere", implemented: true, requiresApiKey: true,
    endpoint: "https://api.cohere.ai/compatibility/v1/chat/completions",
    defaultModel: "command-r", defaultTemperature: 0.2,
  },
  yandex: {
    kind: "openai-compat", category: "llm", label: "YandexGPT", implemented: true, requiresApiKey: true,
    fields: ["folderId"],
    endpoint: "https://llm.api.cloud.yandex.net/v1/chat/completions",
    defaultModel: "yandexgpt-lite", defaultTemperature: 0.2,
  },
  alice: {
    kind: "openai-compat", category: "llm", label: "Alice AI", implemented: true, requiresApiKey: true,
    endpoint: "https://api.alice.yandex.ru/v1/chat/completions",
    defaultModel: "alice", defaultTemperature: 0.2,
    apiKeyUrl: "https://alice.yandex.ru/",
  },
  openrouter: {
    kind: "openai-compat", category: "llm", label: "OpenRouter", implemented: true, requiresApiKey: true,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "openai/gpt-4o-mini", defaultTemperature: 0.2,
    apiKeyUrl: "https://openrouter.ai/keys",
    extraHeaders: { "HTTP-Referer": "https://subtitleos.app", "X-Title": "SubtitleOS" },
  },
  groq: {
    kind: "openai-compat", category: "llm", label: "Groq", implemented: true, requiresApiKey: true,
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile", defaultTemperature: 0.2,
    apiKeyUrl: "https://console.groq.com/keys",
  },
  siliconflow: {
    kind: "openai-compat", category: "llm", label: "SiliconFlow", implemented: true, requiresApiKey: true,
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct", defaultTemperature: 0.2,
  },
  github: {
    kind: "openai-compat", category: "llm", label: "GitHub Models", implemented: true, requiresApiKey: true,
    endpoint: "https://models.inference.ai.azure.com/chat/completions",
    defaultModel: "gpt-4o-mini", defaultTemperature: 0.2,
    apiKeyUrl: "https://github.com/settings/tokens",
  },
  nvidia: {
    kind: "openai-compat", category: "llm", label: "Nvidia NIM", implemented: true, requiresApiKey: true,
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    defaultModel: "meta/llama-3.1-70b-instruct", defaultTemperature: 0.2,
  },
  azureopenai: {
    kind: "custom", category: "llm", label: "Azure OpenAI", implemented: true, requiresApiKey: true,
    fields: ["apiVersion"], acceptsCustomUrl: true,
    defaults: { url: "https://YOUR-RESOURCE.openai.azure.com", model: "gpt-4o-mini", temperature: 0.2 },
  },
  litellm: {
    kind: "openai-compat", category: "llm", label: "LiteLLM", implemented: true, requiresApiKey: false,
    acceptsCustomUrl: true,
    endpoint: "http://127.0.0.1:4000/v1/chat/completions",
    defaultModel: "gpt-4o-mini", defaultTemperature: 0.2,
  },
  llm: {
    kind: "openai-compat", category: "llm", label: "Custom OpenAI-Compatible", implemented: true, requiresApiKey: false,
    acceptsCustomUrl: true,
    endpoint: "http://127.0.0.1:1234/v1/chat/completions",
    defaultModel: "local-model", defaultTemperature: 0.2,
  },
} as const satisfies Record<string, ProviderSpec>;

export type ProviderId = keyof typeof PROVIDERS;

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function getProvider(id: string): ProviderSpec | undefined {
  return (PROVIDERS as Record<string, ProviderSpec>)[id];
}

/**
 * Keyless / self-hosted providers that work without any API key.
 * Every provider is free and unlocked for everyone; this set only marks
 * which ones need no key at all.
 */
export const FREE_PROVIDER_IDS: ReadonlySet<string> = new Set<string>([
  "gtxFreeAPI",
  "edgeFreeAPI",
  "deeplx",
  "mymemory",
  "libretranslate",
  "translategemma",
  "lmstudio",
  "ollama",
  "llamacpp",
  "litellm",
  "llm",
]);

export function isFreeProvider(id: string): boolean {
  return FREE_PROVIDER_IDS.has(id);
}


export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  "machine-translation": "Machine Translation",
  local: "Local Providers",
  llm: "LLM Providers",
};

export function categorized(): Array<{ category: ServiceCategory; items: Array<{ id: ProviderId; spec: ProviderSpec }> }> {
  const order: ServiceCategory[] = ["machine-translation", "local", "llm"];
  return order.map((category) => ({
    category,
    items: PROVIDER_IDS
      .map((id) => ({ id, spec: PROVIDERS[id] as ProviderSpec }))
      .filter((p) => p.spec.category === category),
  }));
}
