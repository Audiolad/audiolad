/** MAX Mini App subdomain (no www). Production host match only — school has no local-dev analog. */
export const MAX_HOSTNAME = "max.audiolad.ru";

export const MAX_ORIGIN = `https://${MAX_HOSTNAME}`;

/** Internal App Router path served for the MAX Mini App root. */
export const MAX_SITE_PATH = "/max-site";

export function isMaxHostname(hostname: string): boolean {
  return hostname === MAX_HOSTNAME;
}

export function isMaxSitePath(pathname: string): boolean {
  return pathname === MAX_SITE_PATH || pathname.startsWith(`${MAX_SITE_PATH}/`);
}
