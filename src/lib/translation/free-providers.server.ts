import type { DispatchParams } from './dispatcher.server';
import { detectLanguage } from './languages';
import { assertSafeExternalUrl } from '../url-guard.server';

/** MyMemory limits each query to 500 UTF-8 bytes, not 500 characters. */
export function splitMyMemoryText(text: string): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = '';
  let bytes = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (bytes + size > 500) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function languageCode(language: string): string {
  if (language === 'zh-hant') return 'zh-TW';
  return language;
}

export async function callMyMemory(p: DispatchParams): Promise<string[]> {
  const out: string[] = [];
  const source = languageCode(p.sourceLang === 'auto' || p.sourceLang === 'multi'
    ? detectLanguage(p.cues.join('\n')) : p.sourceLang);
  for (const cue of p.cues) {
    if (!cue.trim()) { out.push(cue); continue; }
    const translated: string[] = [];
    for (const text of splitMyMemoryText(cue)) {
      const url = new URL('https://api.mymemory.translated.net/get');
      url.searchParams.set('q', text);
      url.searchParams.set('langpair', `${source}|${languageCode(p.targetLang)}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`MyMemory: ${response.status}`);
      const result = await response.json() as {
        responseStatus?: number | string;
        responseDetails?: string;
        quotaFinished?: boolean;
        responseData?: { translatedText?: string };
      };
      if (result.quotaFinished || Number(result.responseStatus) === 429) {
        throw new Error('MyMemory: 429 — free daily translation allowance reached.');
      }
      if (Number(result.responseStatus) !== 200 || typeof result.responseData?.translatedText !== 'string' || !result.responseData.translatedText.trim()) {
        throw new Error(`MyMemory: translation unavailable (${result.responseStatus ?? 'invalid response'}). Check the source and target languages.`);
      }
      translated.push(result.responseData.translatedText);
    }
    out.push(translated.join(''));
  }
  return out;
}

export async function callLibreTranslate(p: DispatchParams): Promise<string[]> {
  const endpoint = p.url?.trim();
  if (!endpoint) throw new Error('LibreTranslate needs your self-hosted or community /translate endpoint URL. The official hosted service requires a key.');
  assertSafeExternalUrl(endpoint);
  const out: string[] = [];
  for (const text of p.cues) {
    if (!text.trim()) { out.push(text); continue; }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: p.sourceLang === 'multi' ? 'auto' : languageCode(p.sourceLang),
        target: languageCode(p.targetLang),
        format: 'text',
        ...(p.apiKey ? { api_key: p.apiKey } : {}),
      }),
    });
    if (!response.ok) throw new Error(`LibreTranslate: ${response.status} — check endpoint access, installed languages and service limits.`);
    const result = await response.json() as { translatedText?: string; error?: string };
    if (result.error || typeof result.translatedText !== 'string' || !result.translatedText.trim()) {
      throw new Error('LibreTranslate returned no translation. Check the installed language pair and endpoint settings.');
    }
    out.push(result.translatedText);
  }
  return out;
}