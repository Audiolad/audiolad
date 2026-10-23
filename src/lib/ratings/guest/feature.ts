type EnvLike = { [key: string]: string | undefined };

function enabled(value: string | undefined): boolean {
  const raw = value?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Collect guest votes into guest_practice_ratings.
 * Default off. Does not change the public aggregate.
 */
export function isGuestRatingsCollectEnabled(env: EnvLike = process.env): boolean {
  return enabled(env.GUEST_RATINGS_COLLECT_ENABLED);
}

/**
 * Show guest totals separately from the registered public aggregate.
 * Default off. Does not add guest stars into the public mean.
 */
export function isGuestRatingsPublicEnabled(env: EnvLike = process.env): boolean {
  return enabled(env.GUEST_RATINGS_PUBLIC_ENABLED);
}

/**
 * Add verified, unclaimed guest votes into the public arithmetic mean.
 * Default off. Separate owner decision from collection and from the
 * separate guest display. Music and audio-practice products stay on
 * their own practice rows, so the two segments are never averaged together.
 */
export function isGuestRatingsIncludedInPublicAggregate(
  env: EnvLike = process.env,
): boolean {
  return enabled(env.GUEST_RATINGS_INCLUDE_IN_AGGREGATE);
}

/**
 * Explicit test mode. Allows a non-production session secret and the
 * `test:` captcha tokens. Must stay off on the public site.
 * The feature can be exercised with this flag and without provider keys.
 */
export function isGuestRatingsTestMode(env: EnvLike = process.env): boolean {
  return enabled(env.GUEST_RATINGS_TEST_MODE);
}

export type GuestCaptchaProvider = "smartcaptcha" | "turnstile";

export function guestRatingsCaptchaProvider(
  env: EnvLike = process.env,
): GuestCaptchaProvider {
  const raw = env.GUEST_RATINGS_CAPTCHA_PROVIDER?.trim().toLowerCase() ?? "";
  return raw === "turnstile" ? "turnstile" : "smartcaptcha";
}
