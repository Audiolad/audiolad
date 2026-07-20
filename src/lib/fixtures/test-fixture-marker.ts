/**
 * Machine-readable test fixture markers — defence in depth for public queries.
 */

export const FIXTURE_MARKER_KEY = "_audiolad_fixture";

export type FixtureMarker = {
  test_fixture: true;
  namespace: string;
  run_id: string;
};

export function hasFixtureMarker(value: unknown): value is Record<string, unknown> & {
  [FIXTURE_MARKER_KEY]: FixtureMarker;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const marker = (value as Record<string, unknown>)[FIXTURE_MARKER_KEY];
  return (
    marker != null &&
    typeof marker === "object" &&
    !Array.isArray(marker) &&
    (marker as FixtureMarker).test_fixture === true &&
    typeof (marker as FixtureMarker).namespace === "string" &&
    typeof (marker as FixtureMarker).run_id === "string"
  );
}

export function isFixtureMarkedPractice(row: {
  cover_image?: unknown;
}): boolean {
  return hasFixtureMarker(row.cover_image);
}

export function isFixtureMarkedAuthor(row: {
  avatar_image?: unknown;
}): boolean {
  return hasFixtureMarker(row.avatar_image);
}

export function shouldBlockPublicPracticeAccess(
  practice: {
    cover_image?: unknown;
    status?: string | null;
    is_catalog_listed?: boolean | null;
  } | null | undefined,
): boolean {
  if (!practice) {
    return true;
  }
  return isFixtureMarkedPractice(practice);
}

export function isPublicCatalogPracticeRow(row: {
  status: string | null;
  is_catalog_listed: boolean | null;
  slug: string | null;
  author_id: string | null;
  cover_image?: unknown;
}): boolean {
  if (isFixtureMarkedPractice(row)) {
    return false;
  }

  return (
    row.status === "published" &&
    row.is_catalog_listed === true &&
    typeof row.slug === "string" &&
    row.slug.trim().length > 0 &&
    row.author_id != null
  );
}

export function filterPublicPracticeRows<T extends { cover_image?: unknown }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !isFixtureMarkedPractice(row));
}

export function filterPublicCatalogPracticeRows<
  T extends {
    status: string | null;
    is_catalog_listed: boolean | null;
    slug: string | null;
    author_id: string | null;
    cover_image?: unknown;
  },
>(rows: T[]): T[] {
  return rows.filter((row) => isPublicCatalogPracticeRow(row));
}
