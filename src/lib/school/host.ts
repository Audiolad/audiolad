/** School marketing subdomain (no www). */
export const SCHOOL_HOSTNAME = "school.audiolad.ru";

export const SCHOOL_ORIGIN = `https://${SCHOOL_HOSTNAME}`;

/** Internal App Router path served for the school root. */
export const SCHOOL_SITE_PATH = "/school-site";

const MAIN_SITE_HOSTS = new Set(["audiolad.ru", "www.audiolad.ru"]);

export function normalizeHostname(hostHeader: string | null | undefined): string {
  const raw = hostHeader?.trim().toLowerCase() ?? "";
  if (!raw) return "";
  return raw.split(":")[0] ?? "";
}

export function getHostnameFromHeaders(headersList: Headers): string {
  const forwarded = headersList.get("x-forwarded-host");
  const host = headersList.get("host");
  return normalizeHostname(forwarded ?? host);
}

export function isSchoolHostname(hostname: string): boolean {
  return hostname === SCHOOL_HOSTNAME;
}

export function isMainSiteHostname(hostname: string): boolean {
  return MAIN_SITE_HOSTS.has(hostname);
}

export function isSchoolSitePath(pathname: string): boolean {
  return (
    pathname === SCHOOL_SITE_PATH || pathname.startsWith(`${SCHOOL_SITE_PATH}/`)
  );
}
