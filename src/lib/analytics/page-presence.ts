/**
 * t1508u: a first-party analytics session (and therefore an admin «Посетитель»)
 * is opened only when a person can actually see the page. Search engines and
 * browsers prerender or open result pages in hidden tabs; such page loads must
 * not create analytics sessions until the page becomes visible.
 */

export type PresenceDocument = {
  visibilityState?: string;
  prerendering?: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

const PRESENCE_EVENTS = ["visibilitychange", "prerenderingchange"] as const;

export function isDocumentPresentForAnalytics(doc: PresenceDocument | null | undefined): boolean {
  if (!doc) return false;
  if (doc.prerendering === true) return false;
  // Older browsers without the Page Visibility API are treated as visible.
  return doc.visibilityState === undefined || doc.visibilityState === "visible";
}

/**
 * Calls `onPresent` once, as soon as the document is visible and not
 * prerendering (immediately if it already is). Returns a cancel function.
 */
export function whenDocumentPresentForAnalytics(
  doc: PresenceDocument | null | undefined,
  onPresent: () => void,
): () => void {
  if (!doc) return () => {};

  let done = false;
  const listener = () => {
    if (done || !isDocumentPresentForAnalytics(doc)) return;
    cleanup();
    onPresent();
  };
  const cleanup = () => {
    done = true;
    for (const type of PRESENCE_EVENTS) doc.removeEventListener(type, listener);
  };

  if (isDocumentPresentForAnalytics(doc)) {
    done = true;
    onPresent();
    return () => {};
  }

  for (const type of PRESENCE_EVENTS) doc.addEventListener(type, listener);
  return cleanup;
}

/** Server side: `Sec-Purpose` / `Purpose` request headers of prefetch and prerender. */
export function isPrefetchOrPrerenderRequest(headers: Pick<Headers, "get">): boolean {
  const values = [headers.get("sec-purpose"), headers.get("purpose"), headers.get("x-purpose")];
  return values.some((value) => /\b(prefetch|prerender)\b/i.test(value ?? ""));
}
