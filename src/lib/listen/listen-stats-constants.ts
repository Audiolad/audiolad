/**
 * Stage 1 rating eligibility: trusted MEDIA-TIME listening.
 * Single source for the 30-second threshold — do not scatter magic numbers.
 */

/** Real audio currentTime that must accrue before rating_eligible_at is set. */
export const RATING_ELIGIBILITY_LISTEN_MS = 30_000;

/** Client heartbeat cadence. Server caps each tick; this is not a wall-clock quota. */
export const LISTEN_STATS_HEARTBEAT_MS = 5_000;

/**
 * Max trusted gap since last_reported_at. Longer idle/session holes
 * accept +0 and adopt a new position baseline — no catch-up without
 * heartbeats. 20s is the smallest value that still covers two missed
 * 5s ticks plus pagehide/visibility/Safari/network jitter, so a routine
 * late heartbeat is not a false reset. Prefer undercounting after
 * background/resume over awarding unconfirmed time.
 */
export const LISTEN_STATS_MAX_HEARTBEAT_GAP_MS = 20_000;

/** Hard per-tick cap on accepted media-time (covers delayed ticks at 1.5×). */
export const LISTEN_STATS_MAX_TICK_MS = 15_000;

/**
 * Substantial jump vs last_position: accept +0 and adopt the new baseline.
 * Larger than max honest delayed tick at 1.5× (~7.5–15s) so jitter is not a seek.
 */
export const LISTEN_STATS_SEEK_JUMP_MS = 20_000;

/**
 * Catalog player max (`PLAYBACK_RATES`) is 1.5×. This is the only legal
 * security multiplier. Client playback_rate is telemetry and must never
 * expand the wall / lifetime budget above this value.
 */
export const LISTEN_STATS_MAX_PLAYBACK_RATE = 1.5;

/** Clamp floor for stored/displayed client rate telemetry only. */
export const LISTEN_STATS_MIN_PLAYBACK_RATE = 0.5;

/**
 * Per-tick wall slack. Must stay 0: lifetime cap is
 * floor(elapsed_since_stats_baseline * 1.5), and repeating slack would
 * otherwise stack on frequent heartbeats. Tiny jitter is not applied
 * because the first heartbeat is already +0 and honest 1× eligibility
 * at ~30–35s is acceptable.
 */
export const LISTEN_STATS_WALL_CLOCK_SLACK_MS = 0;
