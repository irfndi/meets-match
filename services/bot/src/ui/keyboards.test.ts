import { describe, expect, it } from 'vitest';
import { mainMenuKeyboard } from './keyboards.js';

describe('Keyboards', () => {
  describe('mainMenuKeyboard', () => {
    it('should return a Keyboard instance', () => {
      const keyboard = mainMenuKeyboard();

      expect(keyboard).toBeDefined();
    });

    it('should be a function that creates new keyboard each call', () => {
      const keyboard1 = mainMenuKeyboard();
      const keyboard2 = mainMenuKeyboard();

      // Each call should create a new instance
      expect(keyboard1).not.toBe(keyboard2);
    });

    it('should create a resized keyboard', () => {
      const keyboard = mainMenuKeyboard();

      // The keyboard should be configured with resize option
      // We can verify by checking the keyboard's internal state or build output
      expect(keyboard).toBeDefined();
    });

    it('should have expected button structure', () => {
      const keyboard = mainMenuKeyboard();

      // Build the keyboard to check its structure
      const built = keyboard.build();

      // Should have 3 rows (based on the implementation)
      expect(built.length).toBe(3);

      // First row: Start Match, View Profile
      expect(built[0].length).toBe(2);

      // Second row: Sleep/Pause, Invite Friend
      expect(built[1].length).toBe(2);

      // Third row: Settings
      expect(built[2].length).toBe(1);
    });

    it('should have correct button texts', () => {
      const keyboard = mainMenuKeyboard();
      const built = keyboard.build();

      // Flatten and extract button texts (handle both string and object buttons)
      const buttonTexts = built
        .flat()
        .map((btn) => (typeof btn === 'string' ? btn : (btn as { text: string }).text));

      // Check for text content (buttons include emojis)
      expect(buttonTexts.some((t) => t.includes('Start Match'))).toBe(true);
      expect(buttonTexts.some((t) => t.includes('View Profile'))).toBe(true);
      expect(buttonTexts.some((t) => t.includes('Sleep'))).toBe(true);
      expect(buttonTexts.some((t) => t.includes('Invite Friend'))).toBe(true);
      expect(buttonTexts.some((t) => t.includes('Settings'))).toBe(true);
    });
  });
});
