export type BusinessNavIconKey =
  | "home"
  | "locations"
  | "music"
  | "stats"
  | "announcements"
  | "documents"
  | "team"
  | "settings"
  | "help"
  | "more";

export type BusinessNavItem = {
  id: string;
  title: string;
  href: string;
  icon: BusinessNavIconKey;
  /** Only home is interactive in PR1; others are empty stubs. */
  available: boolean;
  /**
   * a8240527: who may open the section. "everyone" sections work for a guest too (limited by
   * server rights); "member" sections stay visible in the same navigation but are locked
   * («доступно после подключения») until the visitor belongs to a Business organization.
   */
  requires: BusinessNavRequirement;
  /** Where a guest goes instead of href (same section, guest entry URL). */
  guestHref?: string;
  /** Other paths that belong to this section (highlighted as current). */
  aliases?: readonly string[];
};

export type BusinessNavRequirement = "everyone" | "member";

export const BUSINESS_PRIMARY_NAV_ITEMS: readonly BusinessNavItem[] = [
  {
    id: "home",
    title: "Главная",
    href: "/",
    icon: "home",
    available: true,
    requires: "everyone",
  },
  {
    id: "music",
    title: "Музыка",
    href: "/music",
    icon: "music",
    available: true,
    requires: "everyone",
    // a8240527: the permanent atlas URL (PDF) is the guest entry to this same section.
    guestHref: "/guest/coffee",
    aliases: ["/guest/coffee", "/workspace"],
  },
] as const;

export const BUSINESS_SECONDARY_NAV_ITEMS: readonly BusinessNavItem[] = [
  {
    id: "documents",
    title: "Документы",
    href: "/documents",
    icon: "documents",
    available: true,
    requires: "member",
  },
  {
    id: "help",
    title: "Помощь",
    href: "/help",
    icon: "help",
    available: true,
    requires: "everyone",
  },
] as const;

/** Owner: at most five buttons. Home, music, documents, help. */
export const BUSINESS_MOBILE_NAV_ITEMS: readonly BusinessNavItem[] = [
  ...BUSINESS_PRIMARY_NAV_ITEMS,
  ...BUSINESS_SECONDARY_NAV_ITEMS,
] as const;

export const BUSINESS_SIDEBAR_EXPANDED_WIDTH_PX = 232;
export const BUSINESS_SIDEBAR_COLLAPSED_WIDTH_PX = 72;
export const BUSINESS_SIDEBAR_STORAGE_KEY = "audiolad-business-sidebar";

/** a8240527: the item is the current section (its href or one of its aliases). */
export function isBusinessNavItemCurrent(
  pathname: string,
  item: Pick<BusinessNavItem, "href" | "aliases" | "guestHref">,
): boolean {
  const paths = [item.href, ...(item.guestHref ? [item.guestHref] : []), ...(item.aliases ?? [])];
  return paths.some((href) => isBusinessNavItemActive(pathname, href));
}

export function isBusinessNavItemActive(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
