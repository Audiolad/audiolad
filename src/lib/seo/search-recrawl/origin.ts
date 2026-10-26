/** Recrawl queue accepts this origin only. Not www, not any other site. */
export const AUDIOLAD_RECRAWL_ORIGIN = "https://audiolad.ru";

const AUDIOLAD_RECRAWL_URL = /^https:\/\/audiolad\.ru(\/|$)/;

/**
 * True when the URL is an exact https://audiolad.ru origin.
 * www, other hosts, credentials, query strings, and fragments are rejected.
 */
export function isAudioladRecrawlUrl(url: string): boolean {
  if (!url || url !== url.trim() || url.length > 2000) {
    return false;
  }

  if (!AUDIOLAD_RECRAWL_URL.test(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.origin === AUDIOLAD_RECRAWL_ORIGIN &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}
