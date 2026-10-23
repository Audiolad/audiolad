type EnvLike = { [key: string]: string | undefined };

function enabled(value: string | undefined): boolean {
  const raw = value?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Used only when GUEST_RATINGS_TEST_MODE is explicitly on and no
 * GUEST_RATINGS_SESSION_SECRET is configured. Not a production secret:
 * it is public, so production refuses it even when it is set explicitly.
 */
export const GUEST_RATING_TEST_SESSION_SECRET = "guest-ratings-test-mode-v1";

/**
 * Production is refused for test secrets and test captcha tokens.
 * An explicit NODE_ENV on the passed env wins, so tests can simulate
 * production without changing the process. A missing NODE_ENV follows
 * the process, which is production on the public site.
 */
export function isGuestRatingsProductionEnv(env: EnvLike = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  if (env.NODE_ENV == null && process.env.NODE_ENV === "production") return true;
  return false;
}

/**
 * Collect guest votes into guest_practice_ratings.
 * Default off. Does not change the public aggregate.
 */
export function isGuestRatingsCollectEnabled(env: EnvLike = process.env): boolean {
  if (!enabled(env.GUEST_RATINGS_COLLECT_ENABLED)) return false;
  // Production without a session secret cannot sign a guest cookie.
  // Treat collection as off so login and voting have no guest effect.
  // The public test constant is treated as missing in production.
  const secret = env.GUEST_RATINGS_SESSION_SECRET?.trim();
  if (
    isGuestRatingsProductionEnv(env) &&
    (!secret || secret === GUEST_RATING_TEST_SESSION_SECRET)
  ) {
    return false;
  }
  return true;
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
 * Copy a linked guest vote into practice_ratings on registration.
 * Default off. Does nothing unless collection is also on. Without this
 * flag a claim only records the account on the guest row.
 */
export function isGuestRatingsClaimCopyEnabled(env: EnvLike = process.env): boolean {
  return enabled(env.GUEST_RATINGS_CLAIM_COPY_ENABLED);
}

/**
 * Explicit test mode. Allows a non-production session secret and the
 * `test:` captcha tokens. Must stay off on the public site.
 * The feature can be exercised with this flag and without provider keys.
 */
export function isGuestRatingsTestMode(env: EnvLike = process.env): boolean {
  if (isGuestRatingsProductionEnv(env)) return false;
  return enabled(env.GUEST_RATINGS_TEST_MODE);
}

export type GuestCaptchaProvider = "smartcaptcha" | "turnstile";

export function guestRatingsCaptchaProvider(
  env: EnvLike = process.env,
): GuestCaptchaProvider {
  const raw = env.GUEST_RATINGS_CAPTCHA_PROVIDER?.trim().toLowerCase() ?? "";
  return raw === "turnstile" ? "turnstile" : "smartcaptcha";
}
