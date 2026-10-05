import { LEGAL_LINKS } from "@/lib/legal/links";
import { miniAppAudioladPageUrl } from "@/lib/mini-app/public-page-url";
import { getVisiblePublicFooterLinks } from "@/lib/navigation/public-footer-links";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { ORGANIZATION_EMAIL } from "@/lib/seo/json-ld/organization-entity";
import { MEDITATION_AUTHORS_LANDING_PROMO_LINK } from "@/lib/seo/meditation-authors-landing";
import { openVkExternalHttps } from "@/lib/vk/bridge";

/** Public Audiolad pages. Opening them does not link a VK identity. */
export const VK_GUEST_LOGIN_URL = `${PRODUCTION_APP_ORIGIN}/auth/sign-in`;
export const VK_GUEST_SIGNUP_URL = `${PRODUCTION_APP_ORIGIN}/auth/sign-up`;
export const VK_PUBLIC_CONTACT_EMAIL = ORGANIZATION_EMAIL;

export type VkFooterLink = {
  href: string;
  title: string;
  url: string;
};

/** Absolute https page on the production origin, with no query, hash, or credentials. */
export function vkAudioladPageUrl(path: string): string | null {
  return miniAppAudioladPageUrl(path);
}

/** Canonical authors landing opened from the VK home banner. Not /become-author. */
export const VK_AUTHORS_LANDING_URL = vkAudioladPageUrl(
  MEDITATION_AUTHORS_LANDING_PROMO_LINK.href,
);

function toFooterLinks(
  items: readonly { href: string; title: string }[],
): VkFooterLink[] {
  return items.flatMap((item) => {
    const url = vkAudioladPageUrl(item.href);
    if (!url) return [];
    return [{ href: item.href, title: item.title, url }];
  });
}

/** Guest discovery links. Staff-only «Статьи» stays hidden for `null`. */
export function getVkDiscoveryFooterLinks(): VkFooterLink[] {
  return toFooterLinks(getVisiblePublicFooterLinks(null));
}

/** Canonical legal documents. Titles and paths come from LEGAL_LINKS. */
export function getVkLegalFooterLinks(): VkFooterLink[] {
  return toFooterLinks(LEGAL_LINKS);
}

const VK_PUBLIC_FOOTER_URLS = new Set<string>([
  ...getVkDiscoveryFooterLinks().map((item) => item.url),
  ...getVkLegalFooterLinks().map((item) => item.url),
]);

const VK_GUEST_EXTERNAL_URLS = new Set<string>([
  VK_GUEST_LOGIN_URL,
  VK_GUEST_SIGNUP_URL,
  ...(VK_AUTHORS_LANDING_URL ? [VK_AUTHORS_LANDING_URL] : []),
  ...VK_PUBLIC_FOOTER_URLS,
]);

export function isVkGuestExternalUrl(url: string): boolean {
  return VK_GUEST_EXTERNAL_URLS.has(url);
}

/**
 * Exact canonical footer pages from getVkDiscoveryFooterLinks and
 * getVkLegalFooterLinks. Login, signup, and the authors landing are not
 * footer links.
 */
export function isVkPublicFooterUrl(url: string): boolean {
  if (!VK_PUBLIC_FOOTER_URLS.has(url)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.origin === PRODUCTION_APP_ORIGIN &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

/** Opens one allowlisted Audiolad page via VK Bridge, or a normal browser tab. */
export function openVkGuestExternalUrl(url: string): boolean {
  if (!isVkGuestExternalUrl(url)) return false;
  return openVkExternalHttps(url);
}
