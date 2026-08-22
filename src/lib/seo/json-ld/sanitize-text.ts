export function sanitizeJsonLdPlainText(value: string): string {
  let text = value.replace(/<[^>]+>/g, " ");
  text = text.replace(/^\s{0,3}#{1,6}[ \t]+/gm, "");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/^#+\s*/gm, "");
  return text.replace(/\s+/g, " ").trim();
}
