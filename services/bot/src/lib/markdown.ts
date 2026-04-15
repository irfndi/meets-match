/**
 * Escapes characters that have special meaning in Telegram's legacy Markdown parsing.
 * This prevents users from injecting Markdown formatting that could break messages.
 */
export function escapeMarkdown(text: string): string {
  if (!text) return text;
  return text.replace(/([_*[\]`\\])/g, '\\$1');
}
