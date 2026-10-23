export type GuestCaptchaMode = "none" | "invisible" | "visible";

export type GuestCaptchaDecision = {
  mode: GuestCaptchaMode;
  /**
   * Why a check is required. Never a ban. A hot shared network only
   * raises the check; it does not reject the vote.
   */
  reason: string | null;
};

export const GUEST_WARM_COOKIE_MS = 20_000;
export const GUEST_VOTE_BURST_10_MIN = 3;
export const GUEST_VOTE_VISIBLE_10_MIN = 8;
export const GUEST_VOTE_BURST_60_MIN = 10;
/**
 * Distinct guest sessions on one network hash in 24h that ask for an
 * invisible check. Shared NAT / CGNAT is expected. This never rejects
 * the vote and never blocks the address.
 */
export const GUEST_HOT_NETWORK_NEW_GUESTS = 40;

export const GUEST_RATING_HARD_LIMIT = 30;
export const GUEST_RATING_HARD_WINDOW_MS = 60_000;
export const GUEST_LISTEN_HARD_LIMIT = 120;
export const GUEST_LISTEN_HARD_WINDOW_MS = 60_000;

/**
 * Adaptive check (architecture variant B). The first warmed vote needs
 * no CAPTCHA. Suspicion asks for an invisible check first and a visible
 * challenge only after a failure or a fast series. There is no deny
 * outcome: one IP / CGNAT is not sanctioned.
 */
export function decideGuestCaptcha(input: {
  cookieAgeMs: number;
  votesIn10Min: number;
  votesIn60Min: number;
  captchaFailures: number;
  /** Null when the network hash is unknown. Unknown is not suspicious. */
  newGuestsOnNetwork24h: number | null;
}): GuestCaptchaDecision {
  if (input.captchaFailures > 0 || input.votesIn10Min >= GUEST_VOTE_VISIBLE_10_MIN) {
    return {
      mode: "visible",
      reason: input.captchaFailures > 0 ? "captcha_retry" : "vote_series",
    };
  }

  const hotNetwork =
    input.newGuestsOnNetwork24h != null &&
    input.newGuestsOnNetwork24h >= GUEST_HOT_NETWORK_NEW_GUESTS;

  if (
    input.votesIn10Min >= GUEST_VOTE_BURST_10_MIN ||
    input.votesIn60Min >= GUEST_VOTE_BURST_60_MIN ||
    input.cookieAgeMs < GUEST_WARM_COOKIE_MS ||
    hotNetwork
  ) {
    return {
      mode: "invisible",
      reason: hotNetwork
        ? "hot_network"
        : input.cookieAgeMs < GUEST_WARM_COOKIE_MS
          ? "fresh_session"
          : "vote_burst",
    };
  }

  return { mode: "none", reason: null };
}

export function isGuestHardRateLimited(
  countInWindow: number,
  limit: number,
): boolean {
  return countInWindow >= limit;
}
