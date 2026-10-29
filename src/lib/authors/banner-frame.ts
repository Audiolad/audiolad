/**
 * Single source of truth for the author banner frame proportions.
 *
 * The public author page, the dashboard preview and the position editor all use
 * these classes so the author sees the same crop that listeners see.
 *
 * - Phones and tablets (< lg, the listener shell is at most 430px wide there):
 *   about 2.75:1, the sides of a 4:1 banner are cropped.
 * - Laptops and desktops (lg and wider): exactly 4:1.
 */
export const AUTHOR_BANNER_MOBILE_ASPECT_RATIO = 11 / 4;
export const AUTHOR_BANNER_DESKTOP_ASPECT_RATIO = 4;

/** Public author page header banner. Capped on ultra-wide screens. */
export const AUTHOR_BANNER_PUBLIC_FRAME_CLASS =
  "aspect-[11/4] lg:aspect-[4/1] lg:max-h-[360px]";

/** Dashboard preview: same ratios and breakpoint as the public page. */
export const AUTHOR_BANNER_PREVIEW_FRAME_CLASS =
  "aspect-[11/4] lg:aspect-[4/1] lg:max-w-[760px]";

/**
 * Position editor frame. The modal is at most 720px wide, so it switches to the
 * desktop ratio from sm to show the desktop crop while positioning.
 */
export const AUTHOR_BANNER_EDITOR_FRAME_CLASS = "aspect-[11/4] sm:aspect-[4/1]";
