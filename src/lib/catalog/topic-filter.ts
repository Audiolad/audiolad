const TOPIC_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CATALOG_TOPIC_FILTER_MAX = 3;

/** Legacy home chips used `?need=` before catalog topic keys existed. */
const LEGACY_NEED_TO_TOPIC_KEY: Readonly<Record<string, string>> = {
  relationships: "relationships",
};

export function resolveCatalogTopicSearchParam(params: {
  topic?: string | null;
  need?: string | null;
}): string | null | undefined {
  const topicParam = params.topic?.trim();

  if (topicParam) {
    return topicParam;
  }

  const legacyNeed = params.need?.trim().toLowerCase();

  if (!legacyNeed) {
    return undefined;
  }

  return LEGACY_NEED_TO_TOPIC_KEY[legacyNeed] ?? undefined;
}

export function parseCatalogTopicKeyList(
  value: string | null | undefined,
): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  const keys: string[] = [];

  for (const part of value.split(",")) {
    const normalized = part.trim().toLowerCase();

    if (!normalized || !TOPIC_KEY_PATTERN.test(normalized) || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    keys.push(normalized);

    if (keys.length >= CATALOG_TOPIC_FILTER_MAX) {
      break;
    }
  }

  return keys;
}

export function serializeCatalogTopicParam(
  keys: readonly string[],
): string | null {
  return keys.length > 0 ? keys.join(",") : null;
}

export function normalizeCatalogTopicParam(
  value: string | null | undefined,
): string | null {
  return serializeCatalogTopicParam(parseCatalogTopicKeyList(value));
}

export function parseCatalogTopicFilters(
  value: string | null | undefined,
  allowedKeys: readonly string[],
): string[] {
  const allowed = new Set(allowedKeys);
  return parseCatalogTopicKeyList(value).filter((key) => allowed.has(key));
}

export function parseCatalogTopicFilter(
  value: string | null | undefined,
  allowedKeys: readonly string[],
): string | null {
  return parseCatalogTopicFilters(value, allowedKeys)[0] ?? null;
}

export function toggleCatalogDraftTopics(
  current: readonly string[],
  key: string,
  max = CATALOG_TOPIC_FILTER_MAX,
): string[] {
  if (current.includes(key)) {
    return current.filter((item) => item !== key);
  }

  if (current.length >= max) {
    return [...current];
  }

  return [...current, key];
}

export function countCatalogFilterGroups(input: {
  topicKeys: readonly string[];
  access: string | null | undefined;
  kind: string | null | undefined;
}): number {
  return [
    input.topicKeys.length > 0,
    Boolean(input.access && input.access !== "all"),
    Boolean(input.kind && input.kind !== "all"),
  ].filter(Boolean).length;
}

export type CatalogHrefOptions = {
  q?: string | null;
  topic?: string | null;
  access?: string | null;
  kind?: string | null;
  sort?: string | null;
};

const CATALOG_SEARCH_HREF_MAX_LENGTH = 100;
const DEFAULT_CATALOG_ACCESS = "all";
const DEFAULT_CATALOG_KIND = "all";
const DEFAULT_CATALOG_SORT = "new";

function normalizeCatalogHrefQuery(value: string | null | undefined): string {
  if (value == null) {
    return "";
  }

  const collapsed = value.trim().replace(/\s+/g, " ");

  if (!collapsed) {
    return "";
  }

  return collapsed.slice(0, CATALOG_SEARCH_HREF_MAX_LENGTH);
}

function normalizeCatalogHrefFilter(
  value: string | null | undefined,
  omittedDefault: string,
): string | null {
  const normalized = value?.trim().toLowerCase() || null;

  if (!normalized || normalized === omittedDefault) {
    return null;
  }

  return normalized;
}

export function buildCatalogHref(options?: CatalogHrefOptions): string {
  const normalizedQuery = normalizeCatalogHrefQuery(options?.q);
  const topicKey = options?.topic?.trim().toLowerCase() || null;
  const access = normalizeCatalogHrefFilter(options?.access, DEFAULT_CATALOG_ACCESS);
  const kind = normalizeCatalogHrefFilter(options?.kind, DEFAULT_CATALOG_KIND);
  const sort = normalizeCatalogHrefFilter(options?.sort, DEFAULT_CATALOG_SORT);

  const params = new URLSearchParams();

  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }

  if (topicKey) {
    params.set("topic", topicKey);
  }

  if (access) {
    params.set("access", access);
  }

  if (kind) {
    params.set("kind", kind);
  }

  if (sort) {
    params.set("sort", sort);
  }

  const query = params.toString();

  return query ? `/catalog?${query}` : "/catalog";
}

export function buildCatalogTopicHref(
  topicKey: string | null,
  q?: string | null,
  listing?: Pick<CatalogHrefOptions, "access" | "kind" | "sort">,
): string {
  return buildCatalogHref({ topic: topicKey, q, ...listing });
}

export function buildCatalogClearSearchHref(
  topicKey: string | null,
  listing?: Pick<CatalogHrefOptions, "access" | "kind" | "sort">,
): string {
  return buildCatalogHref({ topic: topicKey, ...listing });
}

export function getCatalogTopicFilterLabel(
  activeTopicKey: string | null,
  topics: ReadonlyArray<{ key: string; title: string }>,
): string | null {
  const keys = parseCatalogTopicFilters(
    activeTopicKey,
    topics.map((topic) => topic.key),
  );

  if (keys.length === 0) {
    return null;
  }

  const titles = keys
    .map((key) => topics.find((topic) => topic.key === key)?.title?.trim())
    .filter((title): title is string => Boolean(title));

  return titles.length > 0 ? titles.join(", ") : null;
}
