/**
 * Client- and server-safe constants for the Free plan language allow-list.
 * Keep in sync with src/lib/entitlements.server.ts (which re-exports these).
 */
import { LANGUAGES } from "@/lib/translation/languages";

export const FREE_LANG_CODES: ReadonlySet<string> = new Set(
  LANGUAGES.filter((l) => l.code !== "auto").slice(0, 10).map((l) => l.code),
);

export const FREE_LANG_COUNT = FREE_LANG_CODES.size;

export function isFreeLanguage(code: string): boolean {
  return FREE_LANG_CODES.has(code);
}
