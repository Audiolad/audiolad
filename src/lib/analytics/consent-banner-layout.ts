/**
 * Bottom offset for the analytics consent banner above BottomNav + mini-player.
 * Uses existing CSS variables so the banner clears chrome without page-specific branches.
 * Desktop (xl+) has no BottomNav/mini-player chrome – override via `.analytics-consent-banner`.
 */
export function buildAnalyticsConsentBannerBottomOffset(): string {
  return "calc(var(--bottom-nav-main-height) + var(--global-mini-player-height, 0px) + env(safe-area-inset-bottom, 0px) + var(--bottom-nav-viewport-offset, 0px) + 20px)";
}

/** Stack above BottomNav (20) and GlobalMiniPlayer (30); same band as temporary sheets. */
export const ANALYTICS_CONSENT_BANNER_Z_INDEX_CLASS = "z-40";

export const ANALYTICS_CONSENT_BANNER_CLASS = "analytics-consent-banner";
