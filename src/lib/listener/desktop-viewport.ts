export const LISTENER_DESKTOP_MEDIA_QUERY = "(min-width: 1280px)";

export function subscribeListenerDesktopViewport(onStoreChange: () => void): () => void {
  const media = window.matchMedia(LISTENER_DESKTOP_MEDIA_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

export function getListenerDesktopViewportSnapshot(): boolean {
  return window.matchMedia(LISTENER_DESKTOP_MEDIA_QUERY).matches;
}

/** Mobile-first SSR: desktop shell search is mounted only after client viewport check. */
export function getListenerDesktopViewportServerSnapshot(): boolean {
  return false;
}
