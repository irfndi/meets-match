/**
 * Security utilities for the bot.
 */

/**
 * Escapes special characters for Telegram's legacy Markdown mode.
 * Characters escaped: _ * ` [
 */
export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[');
}
