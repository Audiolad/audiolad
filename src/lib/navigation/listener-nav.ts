/**
 * Shared primary navigation for the listener area.
 * Used by mobile BottomNav today; desktop sidebar will extend this in later stages.
 */

export type ListenerPrimaryNavIconKey =
  | "home"
  | "catalog"
  | "library"
  | "playlists"
  | "profile";

export type ListenerPrimaryNavItem = {
  key: ListenerPrimaryNavIconKey;
  /** Visible label and aria-label for the nav control. */
  title: string;
  href: string;
  icon: ListenerPrimaryNavIconKey;
};

/** Primary tabs shown in mobile BottomNav (order preserved). */
export const LISTENER_PRIMARY_NAV_ITEMS: readonly ListenerPrimaryNavItem[] = [
  { key: "home", title: "Главная", href: "/", icon: "home" },
  { key: "catalog", title: "Каталог", href: "/catalog", icon: "catalog" },
  {
    key: "library",
    title: "Аудиотека",
    href: "/my-practices",
    icon: "library",
  },
  {
    key: "playlists",
    title: "Плейлисты",
    href: "/playlists",
    icon: "playlists",
  },
  { key: "profile", title: "Профиль", href: "/profile", icon: "profile" },
] as const;

export type ListenerSidebarNavItem = {
  key: string;
  title: string;
  href: string;
};

/** Desktop sidebar «Моё пространство» — sections without home (logo links to /). */
export const LISTENER_SIDEBAR_NAV_ITEMS: readonly ListenerSidebarNavItem[] = [
  { key: "catalog", title: "Каталог", href: "/catalog" },
  { key: "library", title: "Аудиотека", href: "/my-practices" },
  { key: "playlists", title: "Плейлисты", href: "/playlists" },
  { key: "history", title: "Недавно слушали", href: "/history" },
] as const;

/**
 * Active-state rules for primary listener nav items (BottomNav parity).
 * Neutral paths (legal, auth) never highlight a tab.
 */
export function isListenerPrimaryNavItemActive(
  pathname: string,
  href: string,
  options: { isNeutralPath: boolean },
): boolean {
  if (options.isNeutralPath) {
    return false;
  }

  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
