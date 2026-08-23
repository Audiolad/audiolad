/**
 * Public discovery links shown in the shared LegalFooter.
 * Keep order stable; do not duplicate hrefs.
 */
export const PUBLIC_FOOTER_LINKS = [
  { href: "/about", title: "О платформе" },
  { href: "/philosophy", title: "Принципы" },
  { href: "/for-authors", title: "Авторам" },
  { href: "/articles", title: "Статьи" },
  { href: "/help", title: "Помощь и поддержка" },
] as const;

export type PublicFooterLinkHref = (typeof PUBLIC_FOOTER_LINKS)[number]["href"];

/** Footer «Статьи» is rendered only for this signed-in email. Exact match. */
const ARTICLES_FOOTER_VISIBLE_EMAIL = "1@audiolad.ru";

export function getVisiblePublicFooterLinks(
  currentUserEmail: string | null | undefined,
) {
  return PUBLIC_FOOTER_LINKS.filter(
    (item) =>
      item.href !== "/articles" ||
      currentUserEmail === ARTICLES_FOOTER_VISIBLE_EMAIL,
  );
}
