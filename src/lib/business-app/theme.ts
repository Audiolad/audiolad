/**
 * AudioLad Business theme registry (task 21546de4).
 *
 * One visual system for every business.audiolad.ru screen. Colours live only in
 * `src/components/business-app/theme/business-theme.css` as `--biz-*` tokens scoped by
 * `[data-biz-theme="<id>"]`; components read the tokens and never hard-code colours.
 *
 * Adding a theme later (for example a separate SPA/wellness palette) = one more id here
 * plus one more token block in business-theme.css. No component changes, no new pages.
 * Nothing in this file picks a theme per organisation yet: that would need product and
 * data decisions and is intentionally out of scope.
 */

export const BUSINESS_THEME_IDS = ["jazz-coffee"] as const;

export type BusinessThemeId = (typeof BUSINESS_THEME_IDS)[number];

export type BusinessThemeMeta = {
  id: BusinessThemeId;
  label: string;
  /** Venue types the palette is designed for. Not tied to coffee shops only. */
  segments: readonly string[];
  /** Browser UI colour (address bar / PWA); equals the theme page background. */
  themeColor: string;
};

export const BUSINESS_THEMES: Readonly<Record<BusinessThemeId, BusinessThemeMeta>> = {
  "jazz-coffee": {
    id: "jazz-coffee",
    label: "Jazz & Coffee",
    segments: ["coffee", "cafe", "bar", "restaurant", "hotel"],
    themeColor: "#f7f1e8",
  },
};

export const DEFAULT_BUSINESS_THEME: BusinessThemeId = "jazz-coffee";

export function isBusinessThemeId(value: unknown): value is BusinessThemeId {
  return typeof value === "string" && (BUSINESS_THEME_IDS as readonly string[]).includes(value);
}

/** Theme for the current request. Single theme today; unknown input falls back safely. */
export function resolveBusinessTheme(requested?: string | null): BusinessThemeId {
  return isBusinessThemeId(requested) ? requested : DEFAULT_BUSINESS_THEME;
}
