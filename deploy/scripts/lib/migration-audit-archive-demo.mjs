/**
 * Historical-target semantics for 20260715160000_archive_demo_catalog_practices.
 * Original UPDATE: slug IN (...) AND status = published.
 * Later same-slug rows are not targets.
 */
export const ARCHIVE_DEMO_SLUGS_FINAL = [
  "e2e-test-programma-3-audio",
  "e2e-test-odinochnyy-audioprodukt",
  "first-audio-course",
  "personal-boundaries",
  "sila-zhenstvennosti",
];

export const ARCHIVE_DEMO_MIGRATION_AT = "2026-07-15 16:00:00+00";

function archiveDemoSlugListSql() {
  return ARCHIVE_DEMO_SLUGS_FINAL.map((slug) => "'" + slug + "'").join(",\n    ");
}

export function archiveDemoHistoricalTargetSql() {
  return (
    "slug IN (\n    " +
    archiveDemoSlugListSql() +
    "\n  )\n    AND published_at IS NOT NULL\n    AND published_at < TIMESTAMPTZ '" +
    ARCHIVE_DEMO_MIGRATION_AT +
    "'"
  );
}

export function isArchiveDemoHistoricalTarget(row) {
  if (!ARCHIVE_DEMO_SLUGS_FINAL.includes(row?.slug)) return false;
  if (!row.published_at) return false;
  return Date.parse(row.published_at) < Date.parse("2026-07-15T16:00:00.000Z");
}

export function archiveDemoUnpublishedInvariantHolds(rows) {
  const hist = (rows || []).filter(isArchiveDemoHistoricalTarget);
  if (hist.length === 0) return false;
  return hist.every((row) => {
    if (row.deleted_at) return true;
    return row.status === "unpublished" || row.status === "archived";
  });
}
