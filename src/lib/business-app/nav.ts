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
};

export const BUSINESS_PRIMARY_NAV_ITEMS: readonly BusinessNavItem[] = [
  {
    id: "home",
    title: "Главная",
    href: "/",
    icon: "home",
    available: true,
  },
  {
    id: "locations",
    title: "Точки",
    href: "/locations",
    icon: "locations",
    available: false,
  },
  {
    id: "music",
    title: "Музыка",
    href: "/music",
    icon: "music",
    available: false,
  },
  {
    id: "stats",
    title: "Статистика",
    href: "/stats",
    icon: "stats",
    available: false,
  },
] as const;

export const BUSINESS_SECONDARY_NAV_ITEMS: readonly BusinessNavItem[] = [
  {
    id: "announcements",
    title: "Объявления",
    href: "/announcements",
    icon: "announcements",
    available: false,
  },
  {
    id: "documents",
    title: "Документы и оплата",
    href: "/documents",
    icon: "documents",
    available: false,
  },
  {
    id: "team",
    title: "Команда",
    href: "/team",
    icon: "team",
    available: false,
  },
  {
    id: "settings",
    title: "Настройки",
    href: "/preferences",
    icon: "settings",
    available: false,
  },
  {
    id: "help",
    title: "Помощь",
    href: "/help",
    icon: "help",
    available: false,
  },
] as const;

export const BUSINESS_MOBILE_NAV_ITEMS: readonly BusinessNavItem[] = [
  ...BUSINESS_PRIMARY_NAV_ITEMS,
  {
    id: "more",
    title: "Ещё",
    href: "/more",
    icon: "more",
    available: false,
  },
] as const;

export const BUSINESS_SIDEBAR_EXPANDED_WIDTH_PX = 232;
export const BUSINESS_SIDEBAR_COLLAPSED_WIDTH_PX = 72;
export const BUSINESS_SIDEBAR_STORAGE_KEY = "audiolad-business-sidebar";

export function isBusinessNavItemActive(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
