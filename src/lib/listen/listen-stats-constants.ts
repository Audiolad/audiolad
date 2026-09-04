/**
 * Stage 1 rating eligibility: trusted MEDIA-TIME listening.
 * Single source for the 30-second threshold — do not scatter magic numbers.
 */

/** Real audio currentTime that must accrue before rating_eligible_at is set. */
export const RATING_ELIGIBILITY_LISTEN_MS = 30_000;

/** Client heartbeat cadence. Server caps each tick; this is not a wall-clock quota. */
export const LISTEN_STATS_HEARTBEAT_MS = 5_000;

/** Hard per-tick cap on accepted media-time (covers delayed ticks at 1.5×). */
export const LISTEN_STATS_MAX_TICK_MS = 15_000;

/**
 * Substantial jump vs last_position: accept +0 and adopt the new baseline.
 * Larger than max honest delayed tick at 1.5× (~7.5–15s) so jitter is not a seek.
 */
export const LISTEN_STATS_SEEK_JUMP_MS = 20_000;

/** Catalog player max rate is 1.5×; cap slightly above for clock slack. */
export const LISTEN_STATS_MAX_PLAYBACK_RATE = 2;

export const LISTEN_STATS_MIN_PLAYBACK_RATE = 0.5;

/** Extra ms allowed on a late heartbeat when elapsed ≥ half the cadence. */
export const LISTEN_STATS_WALL_CLOCK_SLACK_MS = 2_000;

/**
 * Lifetime budget bootstrap so the first honest seconds are not clipped
 * before created_at ages: (now - created_at) * max_rate + bootstrap.
 */
export const LISTEN_STATS_BOOTSTRAP_MS = 8_000;
