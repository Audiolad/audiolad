import { LISTENER_DESKTOP_MEDIA_QUERY } from "@/lib/listener/desktop-viewport";

/**
 * Desktop listener chrome is not a document scroller. `overflow: hidden` on
 * html/body still leaves `html` as a scroll container, so Next.js
 * `scrollIntoView` / history restore can set `window.scrollY` and clip the
 * whole `.listener-app-shell` (search, sidebar, right column) above the
 * viewport. Mobile keeps using the document scroller — this helper is a no-op
 * below the desktop breakpoint and never touches
 * `.listener-app-shell__center-scroll`.
 */
export function isListenerDesktopViewport(
  media: Pick<MediaQueryList, "matches"> | null | undefined = typeof window ===
  "undefined"
    ? null
    : window.matchMedia(LISTENER_DESKTOP_MEDIA_QUERY),
): boolean {
  return Boolean(media?.matches);
}

export function resetDesktopShellWindowScroll(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!isListenerDesktopViewport()) {
    return;
  }

  const scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    scrollingElement.scrollTop = 0;
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
}
