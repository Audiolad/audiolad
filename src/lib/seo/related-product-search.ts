export const RELATED_PRODUCT_SEARCH_MIN_CHARS = 2;
export const RELATED_PRODUCT_SEARCH_LIMIT = 20;
export const RELATED_PRODUCT_SEARCH_DEBOUNCE_MS = 300;
export const RELATED_PRODUCT_SEARCH_MAX_QUERY = 120;

/** Hard cap for author product recommendations («Рекомендации автора»). */
export const MAX_AUTHOR_RECOMMENDATIONS = 5;
/** Alias so UI/API share one cap. Do not introduce a second selected-product limit. */
export const RELATED_PRODUCT_SELECTED_LIMIT = MAX_AUTHOR_RECOMMENDATIONS;
/**
 * Empty-query default picker: first N eligible products of the same author.
 * Not the whole catalog.
 */
export const RELATED_PRODUCT_DEFAULT_AUTHOR_LIST_LIMIT = 24;
/**
 * Label lookup for already-selected rows, including legacy lists longer than 5.
 * Higher than MAX_AUTHOR_RECOMMENDATIONS so extras stay visible in the editor.
 */
export const RELATED_PRODUCT_SELECTED_IDS_LOOKUP_LIMIT = 20;
/**
 * Parse ceiling for incoming `related_practice_ids`. Legacy stored lists may
 * still be 6–8; changed lists over MAX_AUTHOR_RECOMMENDATIONS are rejected later.
 */
export const RELATED_PRODUCT_STORED_PARSE_LIMIT = 8;

export const AUTHOR_RECOMMENDATIONS_LIMIT_COPY =
  "Можно добавить до 5 рекомендаций";

/** Helper under «Рекомендации автора» — selection guidance, not the max-reached copy. */
export const AUTHOR_RECOMMENDATIONS_HELPER_COPY =
  "Выберите до 5 продуктов, которые связаны с этой темой и могут быть полезны слушателю дальше.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RelatedProductSearchOption = {
  value: string;
  label: string;
  authorName: string;
  formatLabel: string | null;
  coverUrl: string | null;
};

export type RelatedProductPickerMode = "default" | "search" | "hint";

export function normalizeRelatedProductSearchQuery(value: string): string {
  return value.trim().slice(0, RELATED_PRODUCT_SEARCH_MAX_QUERY);
}

export function shouldSearchRelatedProducts(query: string): boolean {
  return normalizeRelatedProductSearchQuery(query).length >=
    RELATED_PRODUCT_SEARCH_MIN_CHARS;
}

/** Empty query shows this author's eligible products immediately. */
export function shouldListDefaultAuthorProducts(query: string): boolean {
  return normalizeRelatedProductSearchQuery(query).length === 0;
}

export function getRelatedProductPickerMode(
  query: string,
): RelatedProductPickerMode {
  if (shouldListDefaultAuthorProducts(query)) {
    return "default";
  }
  if (shouldSearchRelatedProducts(query)) {
    return "search";
  }
  return "hint";
}

export function escapeRelatedProductIlike(value: string): string {
  return normalizeRelatedProductSearchQuery(value)
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

/** Keep PostgREST `or=` values from breaking on commas or quotes. */
export function toRelatedProductOrFilter(query: string): string {
  const escaped = escapeRelatedProductIlike(query)
    .replaceAll(",", " ")
    .replaceAll("(", " ")
    .replaceAll(")", " ")
    .replaceAll('"', " ");
  return `title.ilike.%${escaped}%,subtitle.ilike.%${escaped}%`;
}

export function parseRelatedProductIdsParam(
  value: string | null | undefined,
  max = RELATED_PRODUCT_SELECTED_IDS_LOOKUP_LIMIT,
): string[] {
  if (!value?.trim()) {
    return [];
  }

  const ids: string[] = [];
  for (const part of value.split(",")) {
    const id = part.trim();
    if (!UUID_PATTERN.test(id) || ids.includes(id)) {
      continue;
    }
    ids.push(id);
    if (ids.length >= max) {
      break;
    }
  }
  return ids;
}

export function canAddRelatedProductId(
  productId: string,
  current: string[],
  max = MAX_AUTHOR_RECOMMENDATIONS,
): { ok: true; next: string[] } | { ok: false; reason: "empty" | "duplicate" | "full" } {
  const id = productId.trim();
  if (!id) {
    return { ok: false, reason: "empty" };
  }

  const filled = current.filter(Boolean);
  if (filled.includes(id)) {
    return { ok: false, reason: "duplicate" };
  }

  if (filled.length >= max) {
    return { ok: false, reason: "full" };
  }

  const emptyIndex = current.findIndex((item) => !item);
  if (emptyIndex >= 0) {
    return {
      ok: true,
      next: current.map((item, index) => (index === emptyIndex ? id : item)),
    };
  }

  return { ok: true, next: [...current, id] };
}

export function sameRelatedPracticeIdList(
  left: string[],
  right: string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

/**
 * Reject only when the recommendations list itself changed and is longer than 5.
 * An unchanged legacy list of 6+ must not block unrelated product-field saves.
 */
export function shouldRejectChangedAuthorRecommendations(
  previous: string[],
  next: string[],
  max = MAX_AUTHOR_RECOMMENDATIONS,
): boolean {
  return !sameRelatedPracticeIdList(previous, next) && next.length > max;
}

export function limitPublicRelatedProducts<T>(items: T[]): T[] {
  return items.slice(0, MAX_AUTHOR_RECOMMENDATIONS);
}
