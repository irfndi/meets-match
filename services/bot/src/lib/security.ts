export function escapeMarkdown(text: string): string {
  if (!text) return text;
  return text.replace(/([\\_*[\]`])/g, '\\$1');
}
