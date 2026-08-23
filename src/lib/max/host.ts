/** MAX Mini App subdomain (no www). Production host match only — school has no local-dev analog. */
export const MAX_HOSTNAME = "max.audiolad.ru";

export const MAX_ORIGIN = `https://${MAX_HOSTNAME}`;

/** Internal App Router path served for the MAX Mini App root. */
export const MAX_SITE_PATH = "/max-site";

/** HMAC-verify raw `window.WebApp.initData`, then touch external identity. MAX host only. */
export const MAX_SESSION_VERIFY_PATH = "/api/max/session/verify";

/** HMAC-verify initData, then link the verified MAX id to the session user. MAX host only. */
export const MAX_SESSION_LINK_PATH = "/api/max/session/link";

export function isMaxHostname(hostname: string): boolean {
  return hostname === MAX_HOSTNAME;
}

export function isMaxSessionVerifyPath(pathname: string): boolean {
  return pathname === MAX_SESSION_VERIFY_PATH;
}

export function isMaxSessionLinkPath(pathname: string): boolean {
  return pathname === MAX_SESSION_LINK_PATH;
}

export function isMaxSitePath(pathname: string): boolean {
  return pathname === MAX_SITE_PATH || pathname.startsWith(`${MAX_SITE_PATH}/`);
}
