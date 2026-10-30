/**
 * Business cabinet live refresh (Sergey 30.10.2026: «каждые три секунды … чтобы не надо было
 * вручную обновлять»). Same approach as audiolad.ru (LivePublicRouteSync): a soft
 * router.refresh() that re-runs the authenticated server loaders, only while the tab is
 * visible, at once when the tab comes back, and with the scroll position kept.
 *
 * It never remounts client components, so the player in the shell keeps playing and typed
 * text stays. On top of that a tick is skipped while a text field is focused, a «Да / Отмена»
 * dialog is open or the previous refresh has not finished. After a while without any
 * activity on the page the cadence drops, so a tablet left open all day does not hammer
 * the server.
 */
export const BUSINESS_LIVE_REFRESH_MS = 3_000;
/** No pointer, key or scroll activity for this long – the page is treated as idle. */
export const BUSINESS_LIVE_IDLE_AFTER_MS = 120_000;
/** Cadence for an idle visible page (the owner home on a counter tablet). */
export const BUSINESS_LIVE_IDLE_REFRESH_MS = 30_000;
/** Focus or visibility bursts within this gap do not refresh twice. */
export const BUSINESS_LIVE_MIN_GAP_MS = 1_500;

/**
 * Cabinet screens that refresh themselves. Server data only, no player and no long forms:
 * /music (player and queue), settings, onboarding, the device join page and guest pages
 * are left alone on purpose.
 */
export const BUSINESS_LIVE_REFRESH_ROUTES = ["/", "/documents", "/help", "/profile"] as const;

export function businessLiveRefreshPath(pathname: string): boolean {
  return (BUSINESS_LIVE_REFRESH_ROUTES as readonly string[]).includes(pathname);
}

/** Text fields, open modal dialogs and anything that opts out explicitly pause the refresh. */
export const BUSINESS_LIVE_REFRESH_PAUSE_SELECTOR =
  '[aria-modal="true"], dialog[open], [data-biz-live-refresh="pause"]';

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "image",
  "hidden",
]);

/** True when the focused element is a place where the visitor types. */
export function isTypingTarget(element: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = (element.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !NON_TEXT_INPUT_TYPES.has((element.type ?? "text").toLowerCase());
}

export type BusinessLiveRefreshEnv = {
  now: () => number;
  isHidden: () => boolean;
  /** Typing, an open dialog or a refresh still in flight. */
  isBusy: () => boolean;
  schedule: (callback: () => void, ms: number) => unknown;
  cancel: (timerId: unknown) => void;
  /** Tab visible again or window focused. */
  addWakeListener: (callback: () => void) => () => void;
  /** Pointer, key, scroll or touch on the page. */
  addActivityListener: (callback: () => void) => () => void;
};

export type BusinessLiveRefreshOptions = {
  intervalMs?: number;
  idleAfterMs?: number;
  idleIntervalMs?: number;
  minGapMs?: number;
};

/**
 * Starts the loop and returns stop(). A tick refreshes when the tab is visible, nothing is
 * busy and the cadence for the current activity level has passed. stop() cancels the timer
 * and the listeners and ignores callbacks that were already queued.
 */
export function startBusinessLiveRefresh(
  refresh: () => void,
  env: BusinessLiveRefreshEnv,
  options: BusinessLiveRefreshOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? BUSINESS_LIVE_REFRESH_MS;
  const idleAfterMs = options.idleAfterMs ?? BUSINESS_LIVE_IDLE_AFTER_MS;
  const idleIntervalMs = Math.max(intervalMs, options.idleIntervalMs ?? BUSINESS_LIVE_IDLE_REFRESH_MS);
  const minGapMs = options.minGapMs ?? BUSINESS_LIVE_MIN_GAP_MS;

  let stopped = false;
  let last = env.now();
  let lastActivity = last;

  const run = (gapMs: number) => {
    if (stopped || env.isHidden() || env.isBusy()) return;
    const now = env.now();
    if (now - last < gapMs) return;
    last = now;
    refresh();
  };

  const onTick = () => {
    const idle = env.now() - lastActivity >= idleAfterMs;
    // A small tolerance so a timer firing a few ms early still counts as a full interval.
    run((idle ? idleIntervalMs : intervalMs) - 50);
  };

  const timerId = env.schedule(onTick, intervalMs);
  const removeWake = env.addWakeListener(() => {
    lastActivity = env.now();
    run(minGapMs);
  });
  const removeActivity = env.addActivityListener(() => {
    const now = env.now();
    const wasIdle = now - lastActivity >= idleAfterMs;
    lastActivity = now;
    // Coming back to an idle page: show fresh data right away instead of waiting.
    if (wasIdle) run(minGapMs);
  });

  return () => {
    stopped = true;
    env.cancel(timerId);
    removeWake();
    removeActivity();
  };
}

/** Header switcher: the person (listen on this phone) or the venue (the hall). */
export type BusinessEntry = "person" | "venue";

/** UI choice only. Access is still checked on the server for every request. */
export const BUSINESS_ENTRY_COOKIE = "al-biz-entry";
const BUSINESS_ENTRY_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseBusinessEntry(value: string | null | undefined): BusinessEntry {
  return value === "venue" ? "venue" : "person";
}

export function businessEntryCookieValue(entry: BusinessEntry, secure: boolean): string {
  return `${BUSINESS_ENTRY_COOKIE}=${entry}; Path=/; Max-Age=${BUSINESS_ENTRY_MAX_AGE_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * What the screen does after a switch. The choice changes the home screen, so from any
 * other screen the cabinet opens home; on home the server data is re-read at once.
 */
export function businessEntrySwitchAction(pathname: string): { kind: "refresh" } | { kind: "navigate"; href: "/" } {
  return pathname === "/" ? { kind: "refresh" } : { kind: "navigate", href: "/" };
}
