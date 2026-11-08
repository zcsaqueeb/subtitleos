export type TranscriptionProviderId =
  | "openai"
  | "openai-gpt4o"
  | "gemini-audio"
  | "qwen-audio"
  | "groq"
  | "fireworks"
  | "replicate"
  | "huggingface"
  | "together"
  | "fal"
  | "litellm"
  | "deepinfra"
  | "novita"
  | "lemonfox"
  | "cloudflare-workers-ai"
  | "sarvam"
  | "openrouter-whisper"
  | "runpod-whisper"
  | "deepgram"
  | "assemblyai"
  | "elevenlabs"
  | "azure-speech"
  | "google-stt"
  | "aws-transcribe"
  | "speechmatics"
  | "revai"
  | "gladia"
  | "soniox"
  | "ibm-watson"
  | "yandex-speechkit"
  | "whisper-cpp"
  | "faster-whisper"
  | "localai"
  | "whisperx"
  | "vosk"
  | "coqui-stt"
  | "custom";

export type TranscriptionCategory = "aggregator" | "llm" | "machine-translation" | "local";

export type TranscriptionProvider = {
  id: TranscriptionProviderId;
  label: string;
  description: string;
  category: TranscriptionCategory;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
  defaultModel?: string;
  models?: { label: string; value: string }[];
  acceptsCustomUrl?: boolean;
  defaultUrl?: string;
  maxBytes: number;
  /** Returns word/segment timestamps natively (vs. evenly distributed). */
  hasTimestamps: boolean;
  /** Provider is fully wired in the dispatcher. False = listed but not yet callable. */
  implemented: boolean;
};

export const TRANSCRIPTION_PROVIDERS: TranscriptionProvider[] = [
  // ===== Aggregator =====
  {
    id: "groq",
    label: "Groq (Whisper)",
    description: "Groq-hosted whisper-large-v3 — very fast and inexpensive.",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://console.groq.com/keys",
    defaultModel: "whisper-large-v3",
    models: [
      { label: "whisper-large-v3", value: "whisper-large-v3" },
      { label: "whisper-large-v3-turbo", value: "whisper-large-v3-turbo" },
    ],
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "fireworks",
    label: "Fireworks AI (Whisper)",
    description: "Fireworks-hosted Whisper endpoint (OpenAI-compatible).",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://fireworks.ai/account/api-keys",
    defaultModel: "whisper-v3",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "replicate",
    label: "Replicate (Whisper)",
    description: "Run Whisper / incredibly-fast-whisper via Replicate.",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://replicate.com/account/api-tokens",
    defaultModel: "openai/whisper",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "huggingface",
    label: "Hugging Face Inference",
    description: "Hosted Whisper / speech-recognition models through Hugging Face.",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://huggingface.co/settings/tokens",
    defaultModel: "openai/whisper-large-v3",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: false,
    implemented: true,
  },
  {
    id: "together",
    label: "Together AI",
    description: "Together-hosted speech recognition models.",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://api.together.xyz/settings/api-keys",
    defaultModel: "openai/whisper-large-v3",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: false,
    implemented: true,
  },
  {
    id: "fal",
    label: "fal.ai (Whisper)",
    description: "fal.ai speech-to-text models.",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://fal.ai/dashboard/keys",
    defaultModel: "fal-ai/whisper",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "litellm",
    label: "LiteLLM Proxy",
    description: "Your LiteLLM/OpenAI-compatible proxy for /audio/transcriptions.",
    category: "aggregator",
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaultUrl: "http://127.0.0.1:4000/v1/audio/transcriptions",
    defaultModel: "whisper-1",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "deepinfra",
    label: "DeepInfra (Whisper)",
    description: "DeepInfra-hosted Whisper (OpenAI-compatible). Cheap, fast.",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://deepinfra.com/dash/api_keys",
    defaultModel: "openai/whisper-large-v3-turbo",
    models: [
      { label: "whisper-large-v3-turbo", value: "openai/whisper-large-v3-turbo" },
      { label: "whisper-large-v3", value: "openai/whisper-large-v3" },
    ],
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "novita",
    label: "Novita AI (Whisper)",
    description: "Novita AI /audio/transcriptions (OpenAI-compatible).",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://novita.ai/settings/key-management",
    defaultModel: "whisper-large-v3",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "lemonfox",
    label: "Lemonfox (Whisper)",
    description: "Lemonfox.ai OpenAI-compatible Whisper endpoint.",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://www.lemonfox.ai/apis",
    defaultModel: "whisper-1",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "openrouter-whisper",
    label: "OpenRouter (Whisper)",
    description: "OpenRouter proxy to Whisper. Paste your OpenRouter key.",
    category: "aggregator",
    requiresApiKey: true,
    apiKeyUrl: "https://openrouter.ai/keys",
    defaultModel: "openai/whisper-1",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "runpod-whisper",
    label: "RunPod (Whisper Serverless)",
    description: "RunPod serverless Whisper endpoint. URL field: your full /runsync URL.",
    category: "aggregator",
    requiresApiKey: true,
    acceptsCustomUrl: true,
    apiKeyUrl: "https://www.runpod.io/console/user/settings",
    defaultUrl: "https://api.runpod.ai/v2/faster-whisper/runsync",
    defaultModel: "large-v3",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "cloudflare-workers-ai",
    label: "Cloudflare Workers AI (Whisper)",
    description:
      'Cloudflare @cf/openai/whisper. API key: Cloudflare API token. URL field: your account ID.',
    category: "aggregator",
    requiresApiKey: true,
    acceptsCustomUrl: true,
    apiKeyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    defaultUrl: "",
    defaultModel: "@cf/openai/whisper-large-v3-turbo",
    models: [
      { label: "@cf/openai/whisper-large-v3-turbo", value: "@cf/openai/whisper-large-v3-turbo" },
      { label: "@cf/openai/whisper", value: "@cf/openai/whisper" },
    ],
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: false,
    implemented: true,
  },
  {
    id: "sarvam",
    label: "Sarvam AI (Saarika)",
    description: "Sarvam AI Saarika — Indian-language STT (Hindi, Tamil, Telugu, etc.).",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://dashboard.sarvam.ai/",
    defaultModel: "saarika:v2",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: false,
    implemented: true,
  },

  // ===== LLM STT =====
  {
    id: "openai",
    label: "OpenAI Whisper",
    description: "Use your own OpenAI key. Returns segment timestamps.",
    category: "llm",
    requiresApiKey: true,
    apiKeyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "whisper-1",
    models: [
      { label: "whisper-1", value: "whisper-1" },
      { label: "gpt-4o-mini-transcribe", value: "gpt-4o-mini-transcribe" },
      { label: "gpt-4o-transcribe", value: "gpt-4o-transcribe" },
    ],
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "openai-gpt4o",
    label: "OpenAI GPT-4o Transcribe",
    description: "Higher-accuracy GPT-4o audio model. Same key as OpenAI.",
    category: "llm",
    requiresApiKey: true,
    apiKeyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-transcribe",
    models: [
      { label: "gpt-4o-transcribe", value: "gpt-4o-transcribe" },
      { label: "gpt-4o-mini-transcribe", value: "gpt-4o-mini-transcribe" },
    ],
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "gemini-audio",
    label: "Google Gemini Audio",
    description: "Gemini multimodal audio transcription.",
    category: "llm",
    requiresApiKey: true,
    apiKeyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.0-flash",
    maxBytes: 20 * 1024 * 1024,
    hasTimestamps: false,
    implemented: true,
  },
  {
    id: "qwen-audio",
    label: "Qwen Audio",
    description: "Qwen audio-capable LLM transcription.",
    category: "llm",
    requiresApiKey: true,
    apiKeyUrl: "https://dashscope.console.aliyun.com/apiKey",
    defaultModel: "qwen-audio-turbo-latest",
    maxBytes: 20 * 1024 * 1024,
    hasTimestamps: false,
    implemented: true,
  },

  // ===== Machine transcription =====
  {
    id: "deepgram",
    label: "Deepgram Nova",
    description: "Fast STT with word timestamps. Great for long-form.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://console.deepgram.com/",
    defaultModel: "nova-2",
    models: [
      { label: "nova-2", value: "nova-2" },
      { label: "nova-3", value: "nova-3" },
    ],
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "assemblyai",
    label: "AssemblyAI",
    description: "Best for long audio (hours). Paragraph & word timestamps.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://www.assemblyai.com/app/account",
    defaultModel: "best",
    models: [
      { label: "best (universal)", value: "best" },
      { label: "nano (cheaper)", value: "nano" },
    ],
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs Scribe",
    description: "ElevenLabs Scribe v2 — high-accuracy, 99+ languages.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://elevenlabs.io/app/settings/api-keys",
    defaultModel: "scribe_v2",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "azure-speech",
    label: "Azure Speech to Text",
    description: "Microsoft Cognitive Services Speech.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://portal.azure.com/",
    acceptsCustomUrl: true,
    defaultUrl: "eastus",
    defaultModel: "default",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "google-stt",
    label: "Google Cloud Speech-to-Text",
    description: "Google Cloud STT v2.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://console.cloud.google.com/apis/credentials",
    defaultModel: "latest_long",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "aws-transcribe",
    label: "AWS Transcribe",
    description:
      'Amazon Transcribe via SigV4. API key format: "ACCESS_KEY_ID:SECRET_ACCESS_KEY" (optionally append ":SESSION_TOKEN"). Endpoint URL field: "REGION|BUCKET" (e.g. "us-east-1|my-transcribe-bucket"). Bucket must allow PutObject + GetObject for the credentials.',
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://console.aws.amazon.com/iam/",
    acceptsCustomUrl: true,
    defaultUrl: "us-east-1|",
    defaultModel: "default",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "speechmatics",
    label: "Speechmatics",
    description: "Enterprise-grade STT with strong accent coverage.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://portal.speechmatics.com/",
    defaultModel: "enhanced",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "revai",
    label: "Rev.ai",
    description: "Rev.ai async transcription API.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://www.rev.ai/access_token",
    defaultModel: "machine",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "gladia",
    label: "Gladia",
    description: "Whisper-based hosted STT with diarization.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://app.gladia.io/account",
    defaultModel: "whisper",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "soniox",
    label: "Soniox",
    description: "Async file transcription with word-level timestamps.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://soniox.com/console/api-keys",
    defaultModel: "stt-async-preview",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "ibm-watson",
    label: "IBM Watson Speech to Text",
    description:
      'IBM Cloud Speech to Text. API key field: IAM API key. Endpoint URL field: full instance URL, e.g. "https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/<id>".',
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://cloud.ibm.com/iam/apikeys",
    acceptsCustomUrl: true,
    defaultUrl: "https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/",
    defaultModel: "en-US_BroadbandModel",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "yandex-speechkit",
    label: "Yandex SpeechKit",
    description:
      "Yandex Cloud short-audio recognition. API key field: IAM token or Api-Key. Endpoint URL field: folder ID.",
    category: "machine-translation",
    requiresApiKey: true,
    apiKeyUrl: "https://yandex.cloud/en/docs/iam/operations/api-key/create",
    acceptsCustomUrl: true,
    defaultUrl: "",
    defaultModel: "general",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: false,
    implemented: true,
  },


  // ===== Local / self-hosted =====
  {
    id: "whisper-cpp",
    label: "whisper.cpp server (Local)",
    description: "Local whisper.cpp HTTP server (OpenAI-compatible).",
    category: "local",
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaultUrl: "http://127.0.0.1:8080/v1/audio/transcriptions",
    defaultModel: "whisper-1",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "faster-whisper",
    label: "faster-whisper-server (Local)",
    description: "Local faster-whisper HTTP server (OpenAI-compatible).",
    category: "local",
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaultUrl: "http://127.0.0.1:8000/v1/audio/transcriptions",
    defaultModel: "Systran/faster-whisper-large-v3",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "localai",
    label: "LocalAI (Local)",
    description: "LocalAI /v1/audio/transcriptions endpoint.",
    category: "local",
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaultUrl: "http://127.0.0.1:8080/v1/audio/transcriptions",
    defaultModel: "whisper-1",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    description:
      "Any OpenAI-compatible /audio/transcriptions endpoint (vLLM, LM Studio, llama.cpp, etc.).",
    category: "local",
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaultUrl: "http://127.0.0.1:1234/v1/audio/transcriptions",
    defaultModel: "whisper-1",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "whisperx",
    label: "WhisperX (Local)",
    description: "Local WhisperX alignment/diarization service.",
    category: "local",
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaultUrl: "http://127.0.0.1:8000/transcribe",
    defaultModel: "large-v3",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "vosk",
    label: "Vosk (Local)",
    description: "Offline Vosk/Kaldi speech recognition server.",
    category: "local",
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaultUrl: "http://127.0.0.1:2700/transcribe",
    defaultModel: "vosk-model",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: true,
    implemented: true,
  },
  {
    id: "coqui-stt",
    label: "Coqui STT (Local)",
    description: "Self-hosted Coqui STT server.",
    category: "local",
    requiresApiKey: false,
    acceptsCustomUrl: true,
    defaultUrl: "http://127.0.0.1:5000/stt",
    defaultModel: "coqui-stt",
    maxBytes: 24 * 1024 * 1024,
    hasTimestamps: false,
    implemented: true,
  },
];

export function getTranscriptionProvider(id: string): TranscriptionProvider | undefined {
  return TRANSCRIPTION_PROVIDERS.find((p) => p.id === id);
}

export const TRANSCRIPTION_CATEGORY_LABEL: Record<TranscriptionCategory, string> = {
  aggregator: "Aggregator",
  llm: "LLM",
  "machine-translation": "Machine translation",
  local: "Local / self-hosted",
};

export function categorizedTranscription(): Array<{
  category: TranscriptionCategory;
  items: TranscriptionProvider[];
}> {
  const order: TranscriptionCategory[] = ["aggregator", "llm", "machine-translation", "local"];
  return order.map((category) => ({
    category,
    items: TRANSCRIPTION_PROVIDERS.filter((p) => p.category === category),
  }));
}
