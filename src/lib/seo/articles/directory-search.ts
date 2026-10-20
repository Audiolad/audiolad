/**
 * Pure helpers for the client-side /articles search.
 * No React / DOM here so they can be unit-tested and reused on the server.
 */

/** Hard cap so a pasted wall of text cannot make filtering expensive. */
export const ARTICLE_SEARCH_QUERY_MAX_LENGTH = 100;

export const ARTICLE_SEARCH_PARAM = "q";

export type ArticleSearchableCard = {
  title: string;
  description: string;
  topicTitle?: string | null;
  searchKeywords?: readonly string[];
};

/**
 * Lowercase, treat «ё» as «е», turn punctuation / hyphens into spaces and
 * collapse whitespace, so «ИИ-музыка», «ии музыка» and «Ии–музыка» compare equal.
 */
export function normalizeArticleSearchText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Clamp and trim a raw query (from input or the ?q= URL parameter). */
export function sanitizeArticleSearchQuery(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== "string") {
    return "";
  }

  return raw.slice(0, ARTICLE_SEARCH_QUERY_MAX_LENGTH).replace(/\s+/g, " ").trim();
}

export function tokenizeArticleSearchQuery(query: string): string[] {
  const normalized = normalizeArticleSearchText(
    sanitizeArticleSearchQuery(query),
  );

  if (!normalized) {
    return [];
  }

  return [...new Set(normalized.split(" ").filter(Boolean))];
}

export function buildArticleSearchHaystack(card: ArticleSearchableCard): string {
  return normalizeArticleSearchText(
    [
      card.title,
      card.description,
      card.topicTitle ?? "",
      ...(card.searchKeywords ?? []),
    ].join(" "),
  );
}

/** Every query word must appear (as a substring) in the card text. */
export function matchesArticleSearchTokens(
  haystack: string,
  tokens: readonly string[],
): boolean {
  return tokens.every((token) => haystack.includes(token));
}

export function filterArticleDirectoryCards<T extends ArticleSearchableCard>(
  cards: readonly T[],
  query: string,
): T[] {
  const tokens = tokenizeArticleSearchQuery(query);

  if (tokens.length === 0) {
    return [...cards];
  }

  return cards.filter((card) =>
    matchesArticleSearchTokens(buildArticleSearchHaystack(card), tokens),
  );
}

function pluralizeMaterials(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "материал";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "материала";
  }

  return "материалов";
}

/** «Найдено 3 материала из 120» while searching, «120 материалов» otherwise. */
export function formatArticleSearchCountLabel(
  found: number,
  total: number,
  hasQuery: boolean,
): string {
  if (!hasQuery) {
    return `${total} ${pluralizeMaterials(total)}`;
  }

  return `Найдено: ${found} ${pluralizeMaterials(found)} из ${total}`;
}

/** Build the shareable /articles URL for a query (empty query → no ?q=). */
export function buildArticleSearchHref(
  pathname: string,
  currentSearch: string,
  query: string,
): string {
  const params = new URLSearchParams(currentSearch);
  const sanitized = sanitizeArticleSearchQuery(query);

  if (sanitized) {
    params.set(ARTICLE_SEARCH_PARAM, sanitized);
  } else {
    params.delete(ARTICLE_SEARCH_PARAM);
  }

  const search = params.toString();

  return search ? `${pathname}?${search}` : pathname;
}
