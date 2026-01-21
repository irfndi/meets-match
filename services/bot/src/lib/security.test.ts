import { describe, expect, it } from 'vitest';
import { escapeMarkdown } from './security.js';

describe('Security Utils', () => {
  describe('escapeMarkdown', () => {
    it('should escape bold characters', () => {
      expect(escapeMarkdown('Hello *World*')).toBe('Hello \\*World\\*');
    });

    it('should escape italic characters', () => {
      expect(escapeMarkdown('Hello _World_')).toBe('Hello \\_World\\_');
    });

    it('should escape link characters', () => {
      expect(escapeMarkdown('[Link]')).toBe('\\[Link]');
    });

    it('should escape code characters', () => {
      expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
    });

    it('should handle mixed characters', () => {
      expect(escapeMarkdown('User_Name *Bold*')).toBe('User\\_Name \\*Bold\\*');
    });

    it('should return empty string for empty input', () => {
      expect(escapeMarkdown('')).toBe('');
    });
  });
});
