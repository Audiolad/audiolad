/** Desktop listener shell scrolls inside this column instead of `window`. */
export const APP_SCROLL_CONTAINER_SELECTOR =
  ".listener-app-shell__center-scroll";

/**
 * Instantly move the document and known app scroll containers to the top.
 * Used when a route must open at the header regardless of the previous page
 * scroll position (Next.js may skip its own reset when a segment already looks
 * "in viewport").
 */
export function resetAppScrollPosition(): void {
  if (typeof window === "undefined") {
    return;
  }

  const scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    scrollingElement.scrollTop = 0;
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);

  document.querySelectorAll(APP_SCROLL_CONTAINER_SELECTOR).forEach((node) => {
    if (node instanceof HTMLElement) {
      node.scrollTop = 0;
    }
  });
}
