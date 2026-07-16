import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

/** Shared profile page shell: mobile column, desktop cabinet up to ~1024px. */
export const profilePageShellClassName = [
  "mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface lg:max-w-[1024px]",
  platformMobileShellClass,
].join(" ");

export const profilePagePaddingClassName = "px-5 pt-6 lg:px-8 lg:pt-8";

/**
 * Two-column grid from lg: DOM order matches mobile (user → continue → …),
 * auto-placement puts «Продолжить» in the right column on the same row as the user card.
 */
export const profilePageGridClassName =
  "grid grid-cols-1 items-start lg:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)] lg:gap-x-6";

export const profilePageFullWidthClassName = "col-span-full min-w-0";

export const profilePageLeftColumnClassName = "min-w-0";
