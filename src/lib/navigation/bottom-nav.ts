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
  "/listen/",
] as const;

export function shouldShowBottomNav(pathname: string): boolean {
  if (BOTTOM_NAV_HIDDEN_EXACT.has(pathname)) {
    return false;
  }

  return !BOTTOM_NAV_HIDDEN_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export const platformNavPaddingClass =
  "pb-[calc(7rem+env(safe-area-inset-bottom,0px))]";
