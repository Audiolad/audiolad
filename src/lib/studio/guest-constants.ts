export const STUDIO_GUEST_COOKIE_NAME = "audiolad_studio_guest";
export const STUDIO_GUEST_MAX_PROJECTS = 3;
export const STUDIO_GUEST_DEFAULT_TTL_DAYS = 7;
export const STUDIO_GUEST_RENDER_RATE_LIMIT = 8;
export const STUDIO_GUEST_RENDER_RATE_WINDOW_MS = 60 * 60 * 1000;

type StudioGuestTtlEnv = {
  STUDIO_GUEST_TTL_DAYS?: string | undefined;
};

export function getStudioGuestTtlDays(
  env: StudioGuestTtlEnv = process.env as StudioGuestTtlEnv,
): number {
  const raw = env.STUDIO_GUEST_TTL_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : STUDIO_GUEST_DEFAULT_TTL_DAYS;
}
