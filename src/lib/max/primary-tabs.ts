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

/** Top-level tabs in display order. Home is the initial screen. */
export const MAX_PRIMARY_TABS: readonly MaxPrimaryTabItem[] = [
  { id: "home", label: "Главная" },
  { id: "catalog", label: "Каталог" },
  { id: "library", label: "Аудиотека" },
  { id: "playlists", label: "Плейлисты" },
  { id: "profile", label: "Профиль" },
];

export const MAX_INITIAL_PRIMARY_TAB: MaxPrimaryTab = "home";

/**
 * Ordinary open starts on Home. Product and promo deeplinks, including a
 * location promo target, still open in the catalog context. Playlist deeplinks
 * open Playlists and take precedence over location promo targets.
 */
export function resolveInitialMaxPrimaryTab(
  startTarget: { kind?: string | null } | null | undefined,
  hasLocationPromo: boolean,
): MaxPrimaryTab {
  if (startTarget?.kind === "playlist") {
    return "playlists";
  }
  if (startTarget?.kind === "product" || startTarget?.kind === "promo") {
    return "catalog";
  }
  if (hasLocationPromo) {
    return "catalog";
  }
  return MAX_INITIAL_PRIMARY_TAB;
}

/** Icon row height. Same 68px as the ordinary mobile tab bar, without its routes. */
export const MAX_TAB_BAR_HEIGHT_PX = 68;

/**
 * Scroll clearance so the last catalog cards sit above the fixed tab bar
 * and the home-indicator inset.
 */
export const MAX_SHELL_CONTENT_BOTTOM_PADDING = `calc(${MAX_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px) + 16px)`;
