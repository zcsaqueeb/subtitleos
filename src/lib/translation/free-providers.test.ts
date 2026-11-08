import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatch } from './dispatcher.server';
import { splitMyMemoryText } from './free-providers.server';
import { getProvider, isFreeProvider } from './registry';

afterEach(() => vi.unstubAllGlobals());

describe('additional free providers', () => {
  it.each(['mymemory', 'libretranslate'])('%s requires no account key', id => {
    expect(isFreeProvider(id)).toBe(true);
    expect(getProvider(id)?.requiresApiKey).toBe(false);
  });

  it('splits UTF-8 text at the actual 500-byte MyMemory limit without losing characters', () => {
    const text = 'नमस्ते 🌍'.repeat(100);
    const parts = splitMyMemoryText(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(text);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(500);
  });

  it('translates MyMemory cues in order without a key and preserves empty cues', async () => {
    const fetchMock = vi.fn(async (_url: unknown) => Response.json({ responseStatus: 200, responseData: { translatedText: 'Hola &amp; adiós' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await dispatch({ providerId: 'mymemory', sourceLang: 'en', targetLang: 'es', cues: ['Hello & goodbye', ''] });
    expect(result).toEqual(['Hola & adiós', '']);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('langpair')).toBe('en|es');
    expect(url.searchParams.has('key')).toBe(false);
  });

  it('rejects MyMemory quota responses instead of exporting an error as subtitles', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ responseStatus: 429, quotaFinished: true, responseData: { translatedText: 'LIMIT REACHED' } })));
    await expect(dispatch({ providerId: 'mymemory', sourceLang: 'en', targetLang: 'es', cues: ['Hello'] })).rejects.toThrow('429');
  });

  it('requires an explicit LibreTranslate endpoint', async () => {
    await expect(dispatch({ providerId: 'libretranslate', sourceLang: 'auto', targetLang: 'es', cues: ['Hello'] })).rejects.toThrow('endpoint URL');
  });

  it('uses LibreTranslate automatic detection and passes a personal key only when provided', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json({ translatedText: 'Hola' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await dispatch({ providerId: 'libretranslate', url: 'https://translate.example.org/translate', sourceLang: 'auto', targetLang: 'es', cues: ['Hello'] })).toEqual(['Hola']);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ q: 'Hello', source: 'auto', target: 'es', format: 'text' });
  });

  it.each(['mymemory', 'libretranslate'])('%s rejects Roman Hindi instead of silently returning Devanagari', async providerId => {
    await expect(dispatch({ providerId, sourceLang: 'en', targetLang: 'hi-Latn', cues: ['Hello'] })).rejects.toThrow('cannot output Hinglish');
  });
});