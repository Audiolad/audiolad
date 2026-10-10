/**
 * Tells the catalog whether it is being shown again because the visitor moved
 * through browser history (Back / Forward, incl. the iOS swipe) as opposed to a
 * fresh navigation (link, tab bar, typed URL).
 *
 * `popstate` is the only signal Next's client router gives for history
 * traversal; a link click clears it so a fresh visit never restores old state.
 * On a full document load the Navigation Timing type (back_forward / reload)
 * only matters when that document IS the catalog: after F5 / a back-forward
 * document load on any other page the flag starts cleared, so a plain click on
 * the "Каталог" tab never restores an old snapshot. The tracker is installed
 * from the root providers (before the catalog grid chunk is imported), so the
 * click / pushState listeners already exist when that click happens.
 */
type Tracker = {
  traversal: boolean;
};

const TRACKER_KEY = "__audioladCatalogHistoryTraversal";

type TrackerHost = typeof globalThis & { [TRACKER_KEY]?: Tracker };

function initialTraversalFromNavigationTiming(): boolean {
  // Only a document that is itself the catalog can be "returned to".
  if (!/^\/catalog\/?$/.test(window.location.pathname)) {
    return false;
  }

  try {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;

    return entry?.type === "back_forward" || entry?.type === "reload";
  } catch {
    return false;
  }
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function getTracker(): Tracker | null {
  if (typeof window === "undefined") {
    return null;
  }

  const host = globalThis as TrackerHost;

  if (host[TRACKER_KEY]) {
    return host[TRACKER_KEY] ?? null;
  }

  const tracker: Tracker = { traversal: initialTraversalFromNavigationTiming() };
  host[TRACKER_KEY] = tracker;

  window.addEventListener("popstate", () => {
    tracker.traversal = true;
  });

  // router.push() / history.pushState is by definition a fresh navigation.
  try {
    const originalPushState = window.history.pushState;

    window.history.pushState = function patchedPushState(
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      tracker.traversal = false;
      return originalPushState.apply(this, args);
    };
  } catch {
    // ignore: click listener below still covers links
  }
  document.addEventListener(
    "click",
    (event) => {
      if (!isPlainLeftClick(event)) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest?.("a[href]");

      if (anchor) {
        tracker.traversal = false;
      }
    },
    true,
  );

  return tracker;
}

/** Install listeners as early as possible (module import on the client). */
export function ensureHistoryTraversalTracking(): void {
  getTracker();
}

/** Read and reset: each mount consumes the traversal that led to it. */
export function consumeHistoryTraversal(): boolean {
  const tracker = getTracker();

  if (!tracker) {
    return false;
  }

  const value = tracker.traversal;
  tracker.traversal = false;

  return value;
}
