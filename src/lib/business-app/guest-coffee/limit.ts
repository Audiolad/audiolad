/**
 * a8240527 — guest listening limit (Sergey 17.10.2026 15:32 MSK). Pure / browser-safe.
 *
 * - 30 minutes of playback, counted and kept on the SERVER (migration 20270108120000),
 *   so it survives reloads and return visits.
 * - Counting does not depend on the client: every stream URL opens a server-side playback
 *   lease (track length known to the server, network remembered) and is charged
 *   min(track length, 15 s) up front; in total a lease costs min(track length, wall-clock
 *   since issue). Before authorising a URL the network total also includes what every
 *   still-open lease of that network would cost now, so fresh cookies with suppressed
 *   reports leave nothing unaccounted. Client reports of actual <audio> progress only add
 *   to the open lease (cumulative, bounded by that same wall clock).
 * - Identity: httpOnly device cookie (primary) + a separate shared counter per client
 *   network (keyed hash of the IP; IPv6 per /64; daily buckets, rolling 30 days).
 *   Effective used = max(device, network - (NETWORK_LIMIT - LIMIT)): one device gets
 *   30 min; cookie juggling on one network gets at most NETWORK_LIMIT per rolling 30 days.
 * - Enforced where it matters: the server refuses new stream URLs once the limit is used.
 *   The track that is already playing is allowed to finish (gentle, no hard cut).
 * - The UI never shows a countdown — only a soft note near the end.
 * Constants are mirrored in the SQL (checked by scripts/business-guest-coffee-unit.mts).
 */

export const GUEST_COFFEE_LIMIT_SECONDS = 30 * 60;
/** Shared per-network allowance per rolling 30 days (2 full guest sessions). */
export const GUEST_COFFEE_NETWORK_LIMIT_SECONDS = 2 * GUEST_COFFEE_LIMIT_SECONDS;
/** Charged up front for every issued stream URL (skip-through / URL harvesting). */
export const GUEST_COFFEE_MIN_LEASE_CHARGE_SECONDS = 15;
/** Soft "near the end" note from 25 minutes of actual playback. */
export const GUEST_COFFEE_WARN_AFTER_SECONDS = 25 * 60;
/** Client reports actual playback at most this often while playing. */
export const GUEST_COFFEE_REPORT_INTERVAL_MS = 15_000;
/** Upper bound of one report (server clamps too). */
export const GUEST_COFFEE_MAX_CREDIT_SECONDS = 60;

export type GuestCoffeeLimitState = "ok" | "near_end" | "exhausted" | "unavailable";

export function guestCoffeeLimitState(usedSeconds: number | null | undefined): GuestCoffeeLimitState {
  if (typeof usedSeconds !== "number" || !Number.isFinite(usedSeconds)) return "unavailable";
  if (usedSeconds >= GUEST_COFFEE_LIMIT_SECONDS) return "exhausted";
  if (usedSeconds >= GUEST_COFFEE_WARN_AFTER_SECONDS) return "near_end";
  return "ok";
}

/** Normalise a client-claimed credit: integer seconds in [0, MAX_CREDIT]. */
export function clampGuestCoffeeCredit(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(GUEST_COFFEE_MAX_CREDIT_SECONDS, Math.floor(n));
}

/**
 * Browser-side meter of actual playback: feed it audio.currentTime on every timeupdate.
 * Only forward progress of a playing element counts; seeks/jumps (>2.5 s) and pauses do not.
 */
export class GuestCoffeePlaybackMeter {
  private last: number | null = null;
  private pending = 0;

  sample(currentTime: number, playing: boolean): void {
    if (!playing || !Number.isFinite(currentTime)) {
      this.last = null;
      return;
    }
    if (this.last !== null) {
      const delta = currentTime - this.last;
      if (delta > 0 && delta <= 2.5) this.pending += delta;
    }
    this.last = currentTime;
  }

  /** Reset the position anchor (new track / seek / pause) without losing pending seconds. */
  reanchor(): void {
    this.last = null;
  }

  /** Whole seconds ready to report; the fraction stays pending. */
  take(max = GUEST_COFFEE_MAX_CREDIT_SECONDS): number {
    const whole = Math.min(max, Math.floor(this.pending));
    this.pending -= whole;
    return whole;
  }

  /** Give back seconds whose report failed (network) so they are retried. */
  restore(seconds: number): void {
    if (seconds > 0) this.pending += seconds;
  }

  get pendingSeconds(): number {
    return this.pending;
  }
}
