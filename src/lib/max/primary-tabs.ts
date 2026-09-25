/**
 * Internal MAX Mini App tabs. These are React state, not AudioLad routes.
 */
export type MaxPrimaryTab =
  | "home"
  | "catalog"
  | "library"
  | "playlists"
  | "profile";

export type MaxPrimaryTabItem = {
  id: MaxPrimaryTab;
  label: string;
};

/** Top-level tabs in display order. Catalog is the initial screen. */
export const MAX_PRIMARY_TABS: readonly MaxPrimaryTabItem[] = [
  { id: "home", label: "Главная" },
  { id: "catalog", label: "Каталог" },
  { id: "library", label: "Аудиотека" },
  { id: "playlists", label: "Плейлисты" },
  { id: "profile", label: "Профиль" },
];

export const MAX_INITIAL_PRIMARY_TAB: MaxPrimaryTab = "catalog";

/** Icon row height. Same 68px as the ordinary mobile tab bar, without its routes. */
export const MAX_BOTTOM_NAV_MAIN_HEIGHT_PX = 68;

/**
 * Scroll clearance so the last catalog cards sit above the fixed tab bar
 * and the home-indicator inset.
 */
export const MAX_SHELL_CONTENT_BOTTOM_PADDING = `calc(${MAX_BOTTOM_NAV_MAIN_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px) + 16px)`;
