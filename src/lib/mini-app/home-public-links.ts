import { LEGAL_LINKS } from "@/lib/legal/links";
import { resolveMaxGuestHomeAuthorUrl } from "@/lib/max/guest-home-slider";
import { getVisiblePublicFooterLinks } from "@/lib/navigation/public-footer-links";
import { ORGANIZATION_EMAIL } from "@/lib/seo/json-ld/organization-entity";
import { MEDITATION_AUTHORS_LANDING_PROMO_LINK } from "@/lib/seo/meditation-authors-landing";
import { miniAppAudioladPageUrl } from "@/lib/mini-app/public-page-url";

export const MINI_APP_PUBLIC_CONTACT_EMAIL = ORGANIZATION_EMAIL;

export const MINI_APP_BECOME_AUTHOR_BANNER_SRC =
  "/images/banners/become-author-mobile-banner-v1.webp";

export const MINI_APP_BECOME_AUTHOR_ARIA_LABEL = "Стать автором на АудиоЛад";

export type MiniAppPublicLink = {
  href: string;
  title: string;
  url: string;
};

function toPublicLinks(
  items: readonly { href: string; title: string }[],
): MiniAppPublicLink[] {
  return items.flatMap((item) => {
    const url = miniAppAudioladPageUrl(item.href);
    if (!url || !url.startsWith("https://")) return [];
    return [{ href: item.href, title: item.title, url }];
  });
}

/** Guest discovery links. Staff-only «Статьи» stays hidden for `null`. */
export function miniAppDiscoveryFooterLinks(): MiniAppPublicLink[] {
  return toPublicLinks(getVisiblePublicFooterLinks(null));
}

/** Canonical legal documents. Titles and paths come from LEGAL_LINKS. */
export function miniAppLegalFooterLinks(): MiniAppPublicLink[] {
  return toPublicLinks(LEGAL_LINKS);
}

/**
 * Absolute https landing for the «Стать автором» banner.
 * Uses the shared promo link, and must match the guest-slider author URL.
 * Never /become-author.
 */
export function miniAppAuthorsLandingUrl(): string | null {
  const url = miniAppAudioladPageUrl(MEDITATION_AUTHORS_LANDING_PROMO_LINK.href);
  if (!url || !url.startsWith("https://")) return null;
  if (url !== resolveMaxGuestHomeAuthorUrl()) return null;
  if (new URL(url).pathname.includes("become-author")) return null;
  return url;
}

export function isMiniAppAuthorsLandingUrl(url: string): boolean {
  const expected = miniAppAuthorsLandingUrl();
  if (!expected || url !== expected || !url.startsWith("https://")) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.pathname === MEDITATION_AUTHORS_LANDING_PROMO_LINK.href &&
      !parsed.pathname.includes("become-author") &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

const MINI_APP_FOOTER_URLS = new Set<string>([
  ...miniAppDiscoveryFooterLinks().map((item) => item.url),
  ...miniAppLegalFooterLinks().map((item) => item.url),
]);

export function isMiniAppFooterUrl(url: string): boolean {
  if (!MINI_APP_FOOTER_URLS.has(url) || !url.startsWith("https://")) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    if (parsed.pathname === "/become-author" || parsed.pathname === "/articles") return false;
    return true;
  } catch {
    return false;
  }
}
