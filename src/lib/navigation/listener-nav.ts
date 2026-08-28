/**
 * Shared primary navigation for the listener area.
 * Mobile BottomNav uses LISTENER_PRIMARY_NAV_ITEMS; desktop sidebar uses
 * LISTENER_SIDEBAR_NAV_ITEMS (including role-gated editorial rows).
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
    href: "/playlists/catalog",
    icon: "playlists",
  },
  { key: "profile", title: "Профиль", href: "/profile", icon: "profile" },
] as const;

export type ListenerSidebarNavIconKey =
  | "lock"
  | "help"
  | "catalog"
  | "library"
  | "playlists"
  | "history"
  | "profile"
  | "editorial-playlists"
  | "editorial-directions";

export type ListenerSidebarNavSection = "space" | "editorial";

export type ListenerSidebarNavItem = {
  key: string;
  title: string;
  href: string;
  icon?: ListenerSidebarNavIconKey;
  section?: ListenerSidebarNavSection;
};

/** Desktop sidebar rows — home is the logo, not a row. */
export const LISTENER_SIDEBAR_NAV_ITEMS: readonly ListenerSidebarNavItem[] = [
  { key: "catalog", title: "Каталог", href: "/catalog", icon: "catalog" },
  { key: "library", title: "Аудиотека", href: "/my-practices", icon: "library" },
  {
    key: "my-materials",
    title: "Личные материалы",
    href: "/my-materials",
    icon: "lock",
  },
  {
    key: "playlists",
    title: "Плейлисты",
    href: "/playlists/catalog",
    icon: "playlists",
  },
  {
    key: "history",
    title: "Недавно слушали",
    href: "/history",
    icon: "history",
  },
  { key: "profile", title: "Профиль", href: "/profile", icon: "profile" },
  { key: "help", title: "Помощь", href: "/help", icon: "help" },
  {
    key: "editorial-playlists",
    title: "Открытые плейлисты",
    href: "/editorial/playlists",
    icon: "editorial-playlists",
    section: "editorial",
  },
  {
    key: "editorial-directions",
    title: "Направления",
    href: "/editorial/directions",
    icon: "editorial-directions",
    section: "editorial",
  },
] as const;

export type ListenerSidebarNavOptions = {
  showMyMaterialsNav: boolean;
  showEditorialNav?: boolean;
  showEditorialDirectionsNav?: boolean;
};

/**
 * Sidebar items for the current listener.
 * «Личные материалы» stay out of the sidebar after Stage 2 — they live in
 * Аудиотека. `showMyMaterialsNav` is kept for callers; it no longer reveals
 * the item. `/my-materials` routes and profile quick links stay as-is.
 * Editorial rows stay gated by the same shell flags as before.
 */
export function getListenerSidebarNavItems(
  options: ListenerSidebarNavOptions,
): readonly ListenerSidebarNavItem[] {
  void options.showMyMaterialsNav;
  return LISTENER_SIDEBAR_NAV_ITEMS.filter((item) => {
    if (item.key === "my-materials") {
      return false;
    }
    if (item.key === "editorial-playlists") {
      return options.showEditorialNav === true;
    }
    if (item.key === "editorial-directions") {
      return (
        options.showEditorialNav === true &&
        options.showEditorialDirectionsNav === true
      );
    }
    return true;
  });
}

export function getListenerSidebarNavSection(
  item: ListenerSidebarNavItem,
): ListenerSidebarNavSection {
  return item.section ?? "space";
}

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

  // Catalog landing still highlights mine/saved/[id] under /playlists/*.
  if (href === "/playlists/catalog") {
    return pathname === "/playlists" || pathname.startsWith("/playlists/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
