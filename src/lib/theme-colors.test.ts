import { expect, it } from 'vitest';
import { contrastRatio, customThemeTokens, readableText } from './theme-colors';
it('selects readable text on light and dark custom backgrounds', () => {
  expect(readableText('#ffffff')).toBe('#111111');
  expect(readableText('#000000')).toBe('#ffffff');
  expect(contrastRatio('#ffffff', '#000000')).toBe(21);
});
it('keeps custom button and surface text readable', () => {
  const tokens = customThemeTokens({ background: '#fafafa', primary: '#eeeeee', accent: '#ff0000' });
  expect(tokens['--foreground']).toBe('#111111');
  expect(tokens['--primary-foreground']).toBe('#111111');
  expect(tokens['--gold']).toBe('#111111');
});
it('rejects incomplete custom colors without applying them', () => {
  expect(customThemeTokens({ background: '#xyz', primary: '#eeeeee', accent: '#ff0000' })).toEqual({});
});