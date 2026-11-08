import { LANGUAGES } from '@/lib/translation/languages';

export function languageOptions(includeAuto = false, includeMixed = false) {
  return LANGUAGES.filter(language =>
    (language.code !== 'auto' || includeAuto) && (language.code !== 'multi' || includeMixed));
}