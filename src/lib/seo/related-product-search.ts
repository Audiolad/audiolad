export const RELATED_PRODUCT_SEARCH_MIN_CHARS = 2;
export const RELATED_PRODUCT_SEARCH_LIMIT = 20;
export const RELATED_PRODUCT_SEARCH_DEBOUNCE_MS = 300;
export const RELATED_PRODUCT_SEARCH_MAX_QUERY = 120;
export const RELATED_PRODUCT_SELECTED_LIMIT = 8;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RelatedProductSearchOption = {
  value: string;
  label: string;
  authorName: string;
  formatLabel: string | null;
  coverUrl: string | null;
};

export function normalizeRelatedProductSearchQuery(value: string): string {
  return value.trim().slice(0, RELATED_PRODUCT_SEARCH_MAX_QUERY);
}

export function shouldSearchRelatedProducts(query: string): boolean {
  return normalizeRelatedProductSearchQuery(query).length >=
    RELATED_PRODUCT_SEARCH_MIN_CHARS;
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

export function parseRelatedProductIdsParam(value: string | null | undefined): string[] {
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
    if (ids.length >= RELATED_PRODUCT_SELECTED_LIMIT) {
      break;
    }
  }
  return ids;
}

export function canAddRelatedProductId(
  productId: string,
  current: string[],
  max = RELATED_PRODUCT_SELECTED_LIMIT,
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
