export type GuestRatingSurface = "web" | "pwa" | "max" | "vk";

/**
 * Where a guest listen sample may be sent. Web and installed PWA share the
 * catalog player. MAX and VK use their own player and send a sample only
 * for an unauthenticated listener while collection is on.
 * Authenticated listeners stay on the registered listen-stats path.
 */
export function shouldReportGuestRatingListen(input: {
  surface: GuestRatingSurface;
  collectEnabled: boolean;
  isAuthenticated: boolean;
  hasPlayableAudio: boolean;
}): boolean {
  if (!input.collectEnabled || input.isAuthenticated || !input.hasPlayableAudio) {
    return false;
  }
  return (
    input.surface === "web" ||
    input.surface === "pwa" ||
    input.surface === "max" ||
    input.surface === "vk"
  );
}
