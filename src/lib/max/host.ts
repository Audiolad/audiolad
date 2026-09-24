/** MAX Mini App subdomain (no www). Production host match only — school has no local-dev analog. */
export const MAX_HOSTNAME = "max.audiolad.ru";

export const MAX_ORIGIN = `https://${MAX_HOSTNAME}`;

/** Internal App Router path served for the MAX Mini App root. */
export const MAX_SITE_PATH = "/max-site";

/** HMAC-verify raw `window.WebApp.initData`, then touch external identity. MAX host only. */
export const MAX_SESSION_VERIFY_PATH = "/api/max/session/verify";

/** HMAC-verify initData, then link the verified MAX id to the session user. MAX host only. */
export const MAX_SESSION_LINK_PATH = "/api/max/session/link";

/** HMAC-verify linked MAX identity, then return the read-only MAX catalog. */
export const MAX_CATALOG_PATH = "/api/max/catalog";
export const MAX_PRODUCT_PATH = "/api/max/product";

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

export function isMaxCatalogPath(pathname: string): boolean {
  return pathname === MAX_CATALOG_PATH;
}
export function isMaxProductPath(pathname: string): boolean {
  return pathname === MAX_PRODUCT_PATH;
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
