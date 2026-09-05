type EnvLike = { [key: string]: string | undefined };

/**
 * Stage 2 star-rating UI rollout.
 * Schema and GET/PUT API ship independently of this flag.
 * Default: disabled. Enable explicitly with RATINGS_UI_ENABLED=true|1|yes|on.
 * Same explicit-enable pattern as PAYOUT_PROFILES_ENABLED.
 */
export function isRatingsUiEnabled(env: EnvLike = process.env): boolean {
  const raw = env.RATINGS_UI_ENABLED?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
