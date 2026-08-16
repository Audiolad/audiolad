import type { ListenPageDefinition } from "./types";

/**
 * Production listen pages are added only from an approved SEO TZ.
 * Stage 3 ships the framework with an empty registry — no fake
 * /listens/test-* indexable page.
 */
const LISTEN_PAGE_DEFINITIONS: readonly ListenPageDefinition[] = [];

const LISTEN_PAGE_BY_SLUG = new Map<string, ListenPageDefinition>(
  LISTEN_PAGE_DEFINITIONS.map((page) => [page.slug, page]),
);

export function listListenPageDefinitions(): readonly ListenPageDefinition[] {
  return LISTEN_PAGE_DEFINITIONS;
}

export function listIndexableListenPageDefinitions(): readonly ListenPageDefinition[] {
  return LISTEN_PAGE_DEFINITIONS.filter((page) => page.indexable !== false);
}

export function listListenPageSlugs(): string[] {
  return LISTEN_PAGE_DEFINITIONS.map((page) => page.slug);
}

export function getListenPageBySlug(slug: string): ListenPageDefinition | null {
  const normalized = slug.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return LISTEN_PAGE_BY_SLUG.get(normalized) ?? null;
}
