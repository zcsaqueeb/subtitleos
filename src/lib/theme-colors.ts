export type CustomTheme = { background: string; primary: string; accent: string };
export function validHex(value: string) { return /^#[0-9a-f]{6}$/i.test(value); }
export function contrastRatio(a: string, b: string) {
  function luminance(hex: string) {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  }
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableText(background: string) {
  return contrastRatio(background, '#ffffff') > contrastRatio(background, '#111111') ? '#ffffff' : '#111111';
}
export function customThemeTokens(theme: CustomTheme): Record<string, string> {
  if (!Object.values(theme).every(validHex)) return {};
  const text = readableText(theme.background);
  const light = text === '#111111';
  return {
    '--background': theme.background, '--card': theme.background, '--popover': theme.background,
    '--foreground': text, '--card-foreground': text, '--popover-foreground': text,
    '--secondary-foreground': text, '--accent-foreground': text, '--primary-foreground': readableText(theme.primary),
    '--primary': theme.primary, '--ring': theme.primary, '--gold': contrastRatio(theme.primary, theme.background) >= 3 ? theme.primary : text,
    '--gold-soft': theme.accent, '--ink': theme.background,
    '--secondary': `color-mix(in oklab, ${theme.background} 90%, ${text})`,
    '--muted': `color-mix(in oklab, ${theme.background} 93%, ${text})`,
    '--muted-foreground': `color-mix(in oklab, ${text} 75%, ${theme.background})`,
    '--accent': `color-mix(in oklab, ${theme.background} 85%, ${text})`,
    '--border': `color-mix(in oklab, ${text} 18%, transparent)`, '--input': `color-mix(in oklab, ${text} 24%, transparent)`,
    '--gradient-gold': `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
    '--shadow-gold': `0 20px 60px -20px ${theme.primary}60`, 'color-scheme': light ? 'light' : 'dark',
  };
}