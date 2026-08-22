import type { ArticleDefinition } from "./types";

export type ArticleVisibleDates = {
  publishedAt: string;
  updatedAt: string;
  publishedLabel: string;
  updatedLabel: string;
  showUpdated: boolean;
};

function parseInstant(value: string): Date | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

/** Calendar day of the editorial ISO timestamp. Dates are stored as UTC midnight. */
export function formatArticleVisibleDate(value: string): string {
  const parsed = parseInstant(value);

  if (!parsed) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function articleDatesDiffer(
  publishedAt: string,
  updatedAt: string,
): boolean {
  const published = parseInstant(publishedAt);
  const updated = parseInstant(updatedAt);

  if (!published || !updated) {
    return false;
  }

  const publishedKey = published.toISOString().slice(0, 10);
  const updatedKey = updated.toISOString().slice(0, 10);

  return publishedKey !== updatedKey;
}

export function resolveArticleVisibleDates(
  article: Pick<ArticleDefinition, "publishedAt" | "updatedAt">,
): ArticleVisibleDates | null {
  const publishedAt = article.publishedAt?.trim() ?? "";
  const updatedAt = article.updatedAt?.trim() ?? "";
  const publishedLabel = formatArticleVisibleDate(publishedAt);

  if (!publishedLabel) {
    return null;
  }

  const updatedLabel = formatArticleVisibleDate(updatedAt);
  const showUpdated = Boolean(updatedLabel && articleDatesDiffer(publishedAt, updatedAt));

  return {
    publishedAt,
    updatedAt,
    publishedLabel,
    updatedLabel,
    showUpdated,
  };
}
