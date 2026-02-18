/**
 * Security utilities for the bot service.
 */

/**
 * Escapes special characters for Telegram's legacy Markdown format.
 * Characters `_`, `*`, `[`, `` ` `` must be escaped.
 *
 * See: https://core.telegram.org/bots/api#markdown-style
 */
export function escapeMarkdown(text: string): string {
  if (!text) return '';
  // Characters '_', '*', '[', '`' must be escaped with the preceding character '\'.
  return text.replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[').replace(/`/g, '\\`');
}
