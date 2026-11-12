/** Cache-bust for ordinary AudioLad email wordmarks after the t1410u violet badge. */
export const CLASSIC_WORDMARK_VERSION = "violet2";

/** Path for next/image. Do not put a query string here: Next 16 rejects it unless images.localPatterns allow search. */
export const AUDIOLAD_HORIZONTAL_LOGO_PATH =
  "/brand/audiolad-logo-horizontal.png" as const;

export const AUDIOLAD_LIGHT_LOGO_PATH =
  "/brand/audiolad-logo-light.webp" as const;

/** Append the wordmark cache-busting query for raw <img> URLs (emails, not next/image). */
export function withClassicWordmarkVersion(url: string): string {
  const isClassicLogo =
    url.includes("audiolad-logo-horizontal.png") ||
    url.includes("audiolad-logo-light.webp");
  if (!isClassicLogo || url.includes(`v=${CLASSIC_WORDMARK_VERSION}`)) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}v=${CLASSIC_WORDMARK_VERSION}`;
}
