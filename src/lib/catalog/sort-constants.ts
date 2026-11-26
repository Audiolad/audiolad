/**
 * Catalog popularity reads `playback_usage_settings.listening_time_valid_from` at
 * query time (set to transaction `now()` when migration below is applied).
 */
export const PLAYBACK_USAGE_METERING_MIGRATION_ID =
  "20261127120000_playback_usage_facts.sql" as const;

/**
 * Readonly audit anchor: earliest production rows in `playback_usage_facts`
 * (not the same as `listening_time_valid_from`, which is migration apply time).
 * See docs/ratings/CATALOG_RATING_SORT_FILTER_SPEC.md (2026-09-17 audit).
 */
export const PLAYBACK_USAGE_PRODUCTION_FIRST_FACTS_REFERENCE_ISO =
  "2026-09-26T00:00:00.000Z" as const;

/** Inclusive minimum MEDIA-TIME per bucket for public catalog popularity. */
export const CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS = 40_000 as const;

/**
 * Public audiolad.ru listener stack writes `playback_usage_facts.usage_kind = consumer`.
 * coffee.audiolad.ru venue player writes `usage_kind = business` (no hostname on facts).
 */
export const PUBLIC_CATALOG_PLAYBACK_USAGE_KIND = "consumer" as const;