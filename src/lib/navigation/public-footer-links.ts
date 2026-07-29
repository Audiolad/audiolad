/**
 * Public discovery links shown in the shared LegalFooter.
 * Keep order stable; do not duplicate hrefs.
 */
export const PUBLIC_FOOTER_LINKS = [
  { href: "/about", title: "О платформе" },
  { href: "/articles", title: "Статьи" },
  { href: "/help", title: "Помощь" },
] as const;

export type PublicFooterLinkHref = (typeof PUBLIC_FOOTER_LINKS)[number]["href"];
