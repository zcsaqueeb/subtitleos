/**
 * Map raw translation-provider error messages to a friendly,
 * user-actionable explanation rendered in the in-app error banner.
 */
export type TranslationErrorInfo = {
  title: string;
  hint: string;
  action?: { label: string; href?: string };
  severity: "error" | "warning" | "info";
  raw: string;
};

export function explainTranslationError(err: unknown): TranslationErrorInfo {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.toLowerCase();

  // Provider-specific knowledge
  if (m.includes("temperature") && m.includes("does not support")) {
    return {
      severity: "warning",
      title: "Model rejected the temperature setting",
      hint:
        "The selected AI model only allows its default creativity setting. Clear the custom temperature in Provider settings (leave it blank) and try again.",
      raw,
    };
  }
  if (m.includes("private or link-local") || m.includes("ssrf")) {
    return {
      severity: "warning",
      title: "Local-only provider can't be reached",
      hint:
        "Providers like TranslateGemma / LM Studio / Ollama run on your own machine (127.0.0.1) and the hosted SubtitleOS server can't talk to them. Pick a hosted provider (Edge, DeepLX, GTX) or run SubtitleOS locally.",
      action: { label: "Change provider", href: "#provider" },
      raw,
    };
  }
  if (m.includes("deeplx")) {
    return {
      severity: "warning",
      title: "DeepLX mirror is busy or blocking requests",
      hint:
        "The free DeepLX endpoint returned 403/429. Switch the batch provider dropdown to Edge or GTX, or wait a minute and retry just the failed files.",
      action: { label: "Retry failed only" },
      raw,
    };
  }
  if (m.includes("edge auth") || (m.includes("edge") && m.includes("400"))) {
    return {
      severity: "warning",
      title: "Microsoft Edge translator token unavailable",
      hint:
        "The free Edge token endpoint refused our request. Use GTX or DeepLX in the meantime — Edge usually recovers within a few minutes.",
      raw,
    };
  }
  if (m.includes("gtx") || m.includes("translate-pa")) {
    return {
      severity: "warning",
      title: "GTX (Google free) is rate-limiting",
      hint:
        "Google's free endpoint returned a 5xx. The batch will auto-fall back, or you can switch the provider dropdown to Edge / DeepLX.",
      raw,
    };
  }
  if (/(^|\b)429\b/.test(m) || m.includes("rate limit") || m.includes("too many")) {
    return {
      severity: "warning",
      title: "Rate limited",
      hint:
        "The provider asked us to slow down. Wait a moment and click Retry, or switch to a different provider in the dropdown.",
      raw,
    };
  }
  if (m.includes("402") || m.includes("credit") || m.includes("payment required")) {
    return {
      severity: "error",
      title: "AI credits exhausted",
      hint:
        "The built-in AI workspace is out of credits. Choose a free provider (Edge / DeepLX / GTX) in the meantime.",
      raw,
    };
  }
  if (m.includes("unauthor") || m.includes("401") || m.includes("forbidden") || m.includes("403")) {
    return {
      severity: "error",
      title: "Provider rejected the API key",
      hint:
        "Open Provider settings and double-check the API key, region, and model. Some providers need an extra header (e.g. region for Azure).",
      action: { label: "Open provider settings", href: "#provider" },
      raw,
    };
  }
  if (m.includes("language_locked")) {
    return {
      severity: "info",
      title: "Language not supported by this provider",
      hint: "This provider can't translate that language. Switch to another provider and retry.",
      raw,
    };
  }
  if (m.includes("limit_reached") || m.includes("limit reached")) {
    return {
      severity: "info",
      title: "Provider limit reached",
      hint: "The provider reported a usage limit. Wait a moment or switch to another provider.",
      raw,
    };
  }
  if (m.includes("network") || m.includes("fetch failed") || m.includes("etimedout")) {
    return {
      severity: "warning",
      title: "Network hiccup talking to the provider",
      hint: "Check your connection and retry. If it keeps happening, try another provider.",
      raw,
    };
  }
  return {
    severity: "error",
    title: "Translation failed",
    hint:
      "Something went wrong with this run. Try again, switch the provider in the dropdown, or copy the technical detail below to support.",
    raw,
  };
}
