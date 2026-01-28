/**
 * Shared security utilities.
 */

/**
 * Escapes special characters for Telegram's Markdown parse mode (legacy).
 * Use this for all user-generated content inserted into Markdown messages.
 *
 * @see https://core.telegram.org/bots/api#markdown-style
 */
export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/[_*[\]`]/g, '\\$&');
}
