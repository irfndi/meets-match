import { describe, expect, it } from 'vitest';
import { escapeMarkdown } from './security.js';

describe('escapeMarkdown', () => {
  it('should escape special characters', () => {
    const input = 'Hello_World *bold* [link] `code`';
    const expected = 'Hello\\_World \\*bold\\* \\[link\\] \\`code\\`';
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it('should handle mixed characters', () => {
    const input = '_*[`]';
    const expected = '\\_\\*\\[\\`\\]';
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it('should return empty string for empty input', () => {
    expect(escapeMarkdown('')).toBe('');
  });

  it('should not escape normal characters', () => {
    const input = 'Hello World 123 !@#$%^&()';
    expect(escapeMarkdown(input)).toBe('Hello World 123 !@#$%^&()');
  });

  it('should escape backslashes', () => {
    const input = '\\foo\\';
    const expected = '\\\\foo\\\\';
    expect(escapeMarkdown(input)).toBe(expected);
  });
});
