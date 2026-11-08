import { describe, expect, it } from 'vitest';
import { languageOptions } from './language-options';

describe('language selection modes', () => {
  it('excludes detection and mixed audio from concrete output languages', () => {
    expect(languageOptions().some(l => l.code === 'auto' || l.code === 'multi')).toBe(false);
    expect(languageOptions().some(l => l.code === 'ur')).toBe(true);
  });
  it('offers source detection once and mixed audio once', () => {
    expect(languageOptions(true, true).filter(l => l.code === 'auto')).toHaveLength(1);
    expect(languageOptions(true, true).filter(l => l.code === 'multi')).toHaveLength(1);
  });
  it('preserves the professional Hinglish language identifier', () => {
    expect(languageOptions().find(l => l.code === 'hi-Latn')?.name).toBe('Hinglish (Professional)');
  });
});