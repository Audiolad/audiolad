const TOPIC_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

export function normalizeCatalogTopicParam(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase();

  if (!normalized || !TOPIC_KEY_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function parseCatalogTopicFilter(
  value: string | null | undefined,
  allowedKeys: readonly string[],
): string | null {
  const normalized = normalizeCatalogTopicParam(value);

  if (!normalized) {
    return null;
  }

  return allowedKeys.includes(normalized) ? normalized : null;
}

export function buildCatalogTopicHref(topicKey: string | null): string {
  if (!topicKey) {
    return "/catalog";
  }

  return `/catalog?topic=${encodeURIComponent(topicKey)}`;
}

export function getCatalogTopicFilterLabel(
  activeTopicKey: string | null,
  topics: ReadonlyArray<{ key: string; title: string }>,
): string | null {
  if (!activeTopicKey) {
    return null;
  }

  return topics.find((topic) => topic.key === activeTopicKey)?.title ?? null;
}
