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

export const CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS = 60_000 as const;