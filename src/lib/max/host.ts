/** MAX Mini App subdomain (no www). Production host match only — school has no local-dev analog. */
export const MAX_HOSTNAME = "max.audiolad.ru";

export const MAX_ORIGIN = `https://${MAX_HOSTNAME}`;

/** Internal App Router path served for the MAX Mini App root. */
export const MAX_SITE_PATH = "/max-site";

/** HMAC-verify raw `window.WebApp.initData`, then touch external identity. MAX host only. */
export const MAX_SESSION_VERIFY_PATH = "/api/max/session/verify";

/** HMAC-verify initData, then link the verified MAX id to the session user. MAX host only. */
export const MAX_SESSION_LINK_PATH = "/api/max/session/link";

/**
 * HMAC-verify initData, then delete only that MAX external identity.
 * Does not delete the AudioLad user. MAX host only.
 */
export const MAX_SESSION_UNLINK_PATH = "/api/max/session/unlink";

/** HMAC-verify linked MAX identity, then return that listener's profile. */
export const MAX_PROFILE_PATH = "/api/max/profile";

/**
 * HMAC-verify linked MAX identity, then return that listener's Stage-1 library.
 * Catalog entitlements, catalog saves, and saved public playlists only.
 */
export const MAX_LIBRARY_PATH = "/api/max/library";

/** HMAC-verify linked MAX identity, then return the read-only MAX catalog. */
export const MAX_CATALOG_PATH = "/api/max/catalog";

/** HMAC-verify initData, then return the public listed playlist catalog. */
export const MAX_PLAYLISTS_CATALOG_PATH = "/api/max/playlists/catalog";

/** HMAC-verify initData, then return one public playlist detail. */
export const MAX_PLAYLISTS_DETAIL_PATH = "/api/max/playlists/detail";

/**
 * HMAC-verify raw initData, then return guest-visible Home shelves.
 * A linked AudioLad account is not required.
 */
export const MAX_HOME_PATH = "/api/max/home";

/** HMAC-verify linked MAX identity, then return catalog topics with products. */
export const MAX_CATALOG_TOPICS_PATH = "/api/max/catalog/topics";
export const MAX_PRODUCT_PATH = "/api/max/product";

/** HMAC-verify linked MAX identity, then return one canonical published promo page. */
export const MAX_PROMO_PATH = "/api/max/promo";

/** HMAC-verify linked MAX identity, then write canonical promo-page analytics. */
export const MAX_PROMO_ANALYTICS_PATH = "/api/max/promo/analytics";

/** HMAC-verify linked MAX identity, then read or write the canonical practice rating. */
export const MAX_RATING_PATH = "/api/max/rating";

/**
 * HMAC-verify linked MAX identity, then start the canonical author-appreciation
 * checkout. Returns a payment link only; it never marks a payment successful.
 */
export const MAX_APPRECIATION_PATH = "/api/max/appreciation";

/** HMAC-verify linked MAX identity, then return a playable session if entitled. */
export const MAX_PLAYBACK_SESSION_PATH = "/api/max/playback/session";

/** HMAC-verify linked MAX identity, then sign one entitled track. */
export const MAX_PLAYBACK_AUDIO_PATH = "/api/max/playback/audio";

/** Ticket-authenticated storefront preview clip. MAX host only. */
export const MAX_PLAYBACK_PREVIEW_PATH = "/api/max/playback/preview";

export function isMaxHostname(hostname: string): boolean {
  return hostname === MAX_HOSTNAME;
}

export function isMaxSessionVerifyPath(pathname: string): boolean {
  return pathname === MAX_SESSION_VERIFY_PATH;
}

export function isMaxSessionLinkPath(pathname: string): boolean {
  return pathname === MAX_SESSION_LINK_PATH;
}

export function isMaxSessionUnlinkPath(pathname: string): boolean {
  return pathname === MAX_SESSION_UNLINK_PATH;
}

export function isMaxProfilePath(pathname: string): boolean {
  return pathname === MAX_PROFILE_PATH;
}

export function isMaxLibraryPath(pathname: string): boolean {
  return pathname === MAX_LIBRARY_PATH;
}

export function isMaxCatalogPath(pathname: string): boolean {
  return pathname === MAX_CATALOG_PATH;
}

export function isMaxPlaylistsCatalogPath(pathname: string): boolean {
  return pathname === MAX_PLAYLISTS_CATALOG_PATH;
}

export function isMaxPlaylistsDetailPath(pathname: string): boolean {
  return pathname === MAX_PLAYLISTS_DETAIL_PATH;
}

export function isMaxHomePath(pathname: string): boolean {
  return pathname === MAX_HOME_PATH;
}

export function isMaxCatalogTopicsPath(pathname: string): boolean {
  return pathname === MAX_CATALOG_TOPICS_PATH;
}
export function isMaxProductPath(pathname: string): boolean {
  return pathname === MAX_PRODUCT_PATH;
}

export function isMaxPromoPath(pathname: string): boolean {
  return pathname === MAX_PROMO_PATH;
}

export function isMaxPromoAnalyticsPath(pathname: string): boolean {
  return pathname === MAX_PROMO_ANALYTICS_PATH;
}

export function isMaxRatingPath(pathname: string): boolean {
  return pathname === MAX_RATING_PATH;
}

export function isMaxAppreciationPath(pathname: string): boolean {
  return pathname === MAX_APPRECIATION_PATH;
}

export function isMaxPlaybackSessionPath(pathname: string): boolean {
  return pathname === MAX_PLAYBACK_SESSION_PATH;
}

export function isMaxPlaybackAudioPath(pathname: string): boolean {
  return pathname === MAX_PLAYBACK_AUDIO_PATH;
}

export function isMaxPlaybackPreviewPath(pathname: string): boolean {
  return pathname === MAX_PLAYBACK_PREVIEW_PATH;
}

export function isMaxSitePath(pathname: string): boolean {
  return pathname === MAX_SITE_PATH || pathname.startsWith(`${MAX_SITE_PATH}/`);
}
