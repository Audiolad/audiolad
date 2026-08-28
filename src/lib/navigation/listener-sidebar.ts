export const LISTENER_SIDEBAR_COOKIE_NAME = "audiolad_listener_sidebar";
export const LISTENER_SIDEBAR_PINNED_STATES = ["expanded", "collapsed"] as const;

export type ListenerSidebarPinnedState =
  (typeof LISTENER_SIDEBAR_PINNED_STATES)[number];

export const LISTENER_SIDEBAR_DEFAULT_PINNED: ListenerSidebarPinnedState =
  "expanded";

export const LISTENER_SIDEBAR_EXPANDED_WIDTH_PX = 240;
export const LISTENER_SIDEBAR_COLLAPSED_WIDTH_PX = 72;
export const LISTENER_SIDEBAR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const LISTENER_SIDEBAR_FLYOUT_OPEN_DELAY_MS = 120;
export const LISTENER_SIDEBAR_FLYOUT_CLOSE_DELAY_MS = 200;
export const LISTENER_SIDEBAR_FINE_HOVER_QUERY =
  "(hover: hover) and (pointer: fine)";

type CookieGetter = {
  get: (name: string) => { value: string } | undefined;
};

export function isListenerSidebarPinnedState(
  value: string | undefined | null,
): value is ListenerSidebarPinnedState {
  return (
    value === "expanded" || value === "collapsed"
  );
}

export function parseListenerSidebarPinnedState(
  value: string | undefined | null,
): ListenerSidebarPinnedState {
  return isListenerSidebarPinnedState(value)
    ? value
    : LISTENER_SIDEBAR_DEFAULT_PINNED;
}

export function readListenerSidebarPinnedState(
  cookieStore: CookieGetter,
): ListenerSidebarPinnedState {
  return parseListenerSidebarPinnedState(
    cookieStore.get(LISTENER_SIDEBAR_COOKIE_NAME)?.value,
  );
}

export function buildListenerSidebarPinnedCookie(
  state: ListenerSidebarPinnedState,
): string {
  return `${LISTENER_SIDEBAR_COOKIE_NAME}=${state}; Path=/; Max-Age=${LISTENER_SIDEBAR_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function writeListenerSidebarPinnedCookie(
  state: ListenerSidebarPinnedState,
) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = buildListenerSidebarPinnedCookie(state);
}
