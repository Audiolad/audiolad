import {
  emitMobileChromeDebug,
  preserveMobileChromeDebugParam,
} from "@/lib/listener/mobile-chrome-debug";

export type ListingSearchRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

/**
 * Query-only listing navigation. Always `{ scroll: false }` — never jump
 * the document when search/filter state is the only change.
 */
export function replaceListingSearch(
  router: ListingSearchRouter,
  href: string,
): void {
  const nextHref = preserveMobileChromeDebugParam(href);
  emitMobileChromeDebug("before-router-replace", { href: nextHref });
  router.replace(nextHref, { scroll: false });
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      emitMobileChromeDebug("after-router-replace", { href: nextHref });
    });
  }
}
