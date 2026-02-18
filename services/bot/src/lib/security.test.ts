import { describe, expect, it } from 'vitest';
import { escapeMarkdown } from './security.js';

describe('escapeMarkdown', () => {
  it('escapes special characters correctly', () => {
    expect(escapeMarkdown('hello_world')).toBe('hello\\_world');
    expect(escapeMarkdown('*bold*')).toBe('\\*bold\\*');
    expect(escapeMarkdown('[link]')).toBe('\\[link]');
    expect(escapeMarkdown('code`')).toBe('code\\`');
  });

  it('handles multiple special characters', () => {
    expect(escapeMarkdown('hello_world *bold* [link] `code`')).toBe(
      'hello\\_world \\*bold\\* \\[link] \\`code\\`',
    );
  });

  it('handles empty strings', () => {
    expect(escapeMarkdown('')).toBe('');
  });

  it('handles strings with no special characters', () => {
    expect(escapeMarkdown('hello world')).toBe('hello world');
  });

  it('handles strings with numbers and other symbols', () => {
    expect(escapeMarkdown('hello 123 !@#$%^&()')).toBe('hello 123 !@#$%^&()');
  });
});
