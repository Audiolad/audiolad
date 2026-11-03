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
  | "profile"
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
    aliases: ["/guest/coffee", "/workspace", "/player"],
  },
  {
    id: "settings",
    title: "Настройка",
    href: "/preferences",
    icon: "settings",
    available: true,
    requires: "member",
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
    id: "profile",
    title: "Профиль",
    href: "/profile",
    icon: "profile",
    available: true,
    requires: "member",
  },
] as const;

/** Exactly five buttons, in this order: home, music, sound settings, documents, profile. */
export const BUSINESS_MOBILE_NAV_ITEMS: readonly BusinessNavItem[] = [
  ...BUSINESS_PRIMARY_NAV_ITEMS,
  ...BUSINESS_SECONDARY_NAV_ITEMS,
] as const;

/** «Помощь» is a section of the hall device menu (cabinet-mode.ts); the owner reaches it from «Профиль». */
export const BUSINESS_HELP_NAV_ITEM: BusinessNavItem = {
  id: "help",
  title: "Помощь",
  href: "/help",
  icon: "help",
  available: true,
  requires: "everyone",
};

const BUSINESS_NAV_ITEMS_BY_ID: Readonly<Record<string, BusinessNavItem>> = Object.fromEntries(
  [...BUSINESS_MOBILE_NAV_ITEMS, BUSINESS_HELP_NAV_ITEM].map((item) => [item.id, item]),
);

/**
 * The menu for one cabinet mode: the section ids come from the shared permission table
 * (businessCabinetSections in cabinet-mode.ts), in that order. Nav, sidebar and pages read the same table.
 */
export function businessNavItemsForSections(sectionIds: readonly string[]): BusinessNavItem[] {
  return sectionIds.map((id) => BUSINESS_NAV_ITEMS_BY_ID[id]).filter((item): item is BusinessNavItem => Boolean(item));
}

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

/**
 * The one current section among `items` for a normalized pathname (see `businessNavPathname`),
 * or null. The first matching item wins, so the bar never highlights two tabs at once.
 */
export function businessActiveNavItemId(
  pathname: string,
  items: readonly Pick<BusinessNavItem, "id" | "href" | "aliases" | "guestHref">[],
): string | null {
  return items.find((item) => isBusinessNavItemCurrent(pathname, item))?.id ?? null;
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
