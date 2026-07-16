/** Canonical production origin for SEO URLs. */
export const PRODUCTION_APP_ORIGIN = "https://audiolad.ru";

/**
 * Public site origin for metadata, canonical URLs, and sitemap.
 * Does not read request headers — only env with a safe production fallback.
 */
export function getAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return PRODUCTION_APP_ORIGIN;
}

export function getAppOriginUrl(): URL {
  return new URL(`${getAppOrigin()}/`);
}
