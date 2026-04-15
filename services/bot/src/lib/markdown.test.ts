import { describe, expect, it } from 'vitest';
import { escapeMarkdown } from './markdown.js';

describe('escapeMarkdown', () => {
  it('escapes markdown characters', () => {
    expect(escapeMarkdown('hello *world*')).toBe('hello \\*world\\*');
    expect(escapeMarkdown('user_name')).toBe('user\\_name');
    expect(escapeMarkdown('[link](url)')).toBe('\\[link\\](url)');
    expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
    expect(escapeMarkdown('\\')).toBe('\\\\');
  });

  it('handles empty or undefined strings', () => {
    expect(escapeMarkdown('')).toBe('');
    expect(escapeMarkdown(undefined as any)).toBeUndefined();
  });
});
