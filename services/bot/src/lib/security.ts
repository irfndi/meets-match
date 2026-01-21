/**
 * Security utilities for the bot.
 */

/**
 * Escapes special characters for Telegram's legacy Markdown parse mode.
 * Escapes: * _ [ `
 *
 * This prevents users from injecting markdown formatting (e.g. bold, italics, links)
 * into messages, which could break the message parsing or be used for spoofing.
 */
export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/([_*\[`])/g, '\\$1');
}
