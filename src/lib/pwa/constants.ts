/** Duration to hide the banner after «Напомнить позже». */
export const PWA_REMIND_LATER_MS = 3 * 24 * 60 * 60 * 1000;

export const PWA_STORAGE_PREFIX = "audiolad_pwa_";

export const PWA_LOCAL_STORAGE_KEYS = {
  deviceState: `${PWA_STORAGE_PREFIX}device_state`,
  valueMomentAt: `${PWA_STORAGE_PREFIX}value_moment_at`,
  sessionBannerShown: `${PWA_STORAGE_PREFIX}session_banner_shown`,
  sessionId: `${PWA_STORAGE_PREFIX}session_id`,
  visitCount: `${PWA_STORAGE_PREFIX}visit_count`,
} as const;

export const PWA_AUTH_ROUTE_PREFIXES = ["/auth/"] as const;

export const PWA_CABINET_ROUTE_PREFIXES = [
  "/profile",
  "/my-practices",
  "/playlists",
  "/history",
  "/settings",
  "/favorites",
  "/downloads",
  "/purchases",
] as const;

export const PWA_EXCLUDED_ROUTE_PREFIXES = [
  "/auth/",
  "/listen/",
  "/checkout/",
  "/author-dashboard/",
] as const;

export const PWA_SW_PATH = "/sw.js";

export const PWA_ANALYTICS_SESSION_KEY = `${PWA_STORAGE_PREFIX}analytics_session`;

export const PWA_PLATFORM_VALUES = [
  "android",
  "ios",
  "desktop_chromium",
  "desktop_other",
  "unknown",
] as const;

export type PwaPlatform = (typeof PWA_PLATFORM_VALUES)[number];

export const PWA_INSTALL_STATES = [
  "eligible",
  "prompt_available",
  "instructions_only",
  "dismissed",
  "installed_confirmed",
  "unsupported",
] as const;

export type PwaInstallState = (typeof PWA_INSTALL_STATES)[number];

export type PwaDeviceLocalState = {
  status: PwaInstallState;
  dismissedUntil: number | null;
  installedAt: number | null;
  installPlatform: PwaPlatform | null;
  lastStandaloneOpenedAt: number | null;
  /** Browser accepted install prompt; final install still awaits appinstalled/standalone. */
  promptAcceptedAt: number | null;
};

export const PWA_DEFAULT_DEVICE_STATE: PwaDeviceLocalState = {
  status: "eligible",
  dismissedUntil: null,
  installedAt: null,
  installPlatform: null,
  lastStandaloneOpenedAt: null,
  promptAcceptedAt: null,
};
