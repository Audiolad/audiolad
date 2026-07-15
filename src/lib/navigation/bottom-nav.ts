const BOTTOM_NAV_HIDDEN_EXACT = new Set([
  "/offer",
  "/privacy",
  "/consent",
  "/payment-and-refund",
  "/requisites",
]);

const BOTTOM_NAV_HIDDEN_PREFIXES = [
  "/auth/",
  "/checkout/",
] as const;

/** Основная зона меню без нижнего safe area (иконки + подписи). */
export const BOTTOM_NAV_MAIN_HEIGHT_PX = 68;

/** Дополнительный визуальный запас контента над фиксированным меню. */
export const BOTTOM_NAV_CONTENT_GAP_PX = 28;

export function shouldShowBottomNav(pathname: string): boolean {
  if (BOTTOM_NAV_HIDDEN_EXACT.has(pathname)) {
    return false;
  }

  return !BOTTOM_NAV_HIDDEN_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export const platformTopSafePaddingClass = "platform-top-safe-padding";

export const platformNavPaddingClass = "platform-bottom-nav-padding";

export const platformMobileShellClass = "platform-mobile-shell";

/** Единый фон светлой оболочки: html, body, theme-color, safe area, страницы. */
export const PLATFORM_SURFACE_BACKGROUND = "#f7f2fc";

export const PLATFORM_LIGHT_THEME_COLOR = PLATFORM_SURFACE_BACKGROUND;

/** Фон приподнятых карточек внутри страниц, не оболочки. */
export const PLATFORM_ELEVATED_SURFACE_BACKGROUND = "#fffdfd";

/** @deprecated Используйте PLATFORM_ELEVATED_SURFACE_BACKGROUND для карточек. */
export const PLATFORM_LIGHT_SURFACE_COLOR = PLATFORM_ELEVATED_SURFACE_BACKGROUND;
export const PLATFORM_PLAYER_THEME_COLOR = "#6f4bbb";
export const PLATFORM_PLAYER_SURFACE_COLOR = "#24133f";
