/**
 * Security utilities for the bot.
 */

/**
 * Escapes special characters for Telegram's legacy Markdown parse mode.
 * Escapes: `_`, `*`, `[`, and `\`
 *
 * @param text The text to escape.
 * @returns The escaped text.
 */
export const escapeMarkdown = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\') // Escape backslashes first to avoid double-escaping
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`');
};
