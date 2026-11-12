/** Cache-bust for ordinary AudioLad wordmarks after the t1410u violet badge. */
export const CLASSIC_WORDMARK_VERSION = "violet2";

export const AUDIOLAD_HORIZONTAL_LOGO_PATH =
  `/brand/audiolad-logo-horizontal.png?v=${CLASSIC_WORDMARK_VERSION}` as const;

export const AUDIOLAD_LIGHT_LOGO_PATH =
  `/brand/audiolad-logo-light.webp?v=${CLASSIC_WORDMARK_VERSION}` as const;

/** Append the wordmark cache-busting query if this is a classic logo URL. */
export function withClassicWordmarkVersion(url: string): string {
  const isClassicLogo =
    url.includes("audiolad-logo-horizontal.png") ||
    url.includes("audiolad-logo-light.webp");
  if (!isClassicLogo || url.includes(`v=${CLASSIC_WORDMARK_VERSION}`)) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}v=${CLASSIC_WORDMARK_VERSION}`;
}
