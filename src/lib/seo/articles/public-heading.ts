const TECHNICAL_CLOSING_HEADINGS = new Set([
  "финальный cta",
  "final cta",
  "afterfinalaudio",
  "after final audio",
]);

export function resolveArticleClosingHeading(title: string) {
  return TECHNICAL_CLOSING_HEADINGS.has(title.trim().toLowerCase())
    ? "Главное"
    : title;
}
