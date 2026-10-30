/**
 * Public venue licence page and its host rewrite (task 90d24628).
 * Server env only. Off (the default) answers 404 for /v/<id>, including on
 * business.audiolad.ru. Turn on only after the owner approves publication.
 * Do not set this in production until that approval.
 */
export const VENUE_LICENCE_PUBLIC_KEY = "AUDIOLAD_BUSINESS_VENUE_LICENCE_PUBLIC" as const;

export function isVenueLicencePublicEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[VENUE_LICENCE_PUBLIC_KEY] === "1";
}

/**
 * Fictional sample pages for local screenshots. Never in a production build:
 * next start and the production bundle run with NODE_ENV=production.
 */
export function isVenueLicenceFixtureEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NODE_ENV !== "production" && env.AUDIOLAD_VENUE_LICENCE_FIXTURES === "1";
}
