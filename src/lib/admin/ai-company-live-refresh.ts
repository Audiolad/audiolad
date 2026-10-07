/** Same cadence as the previous document-level meta refresh on the live tablo. */
export const AI_COMPANY_LIVE_REFRESH_MS = 45_000;

/**
 * Refresh only while the ИИ-компания page is mounted.
 * The returned function cancels the timer and ignores a callback that was
 * already queued, so leaving the page cannot navigate back to it.
 */
export function startScopedPageRefresh(
  refresh: () => void,
  intervalMs: number,
  schedule: (callback: () => void, ms: number) => number = (callback, ms) =>
    setInterval(callback, ms) as unknown as number,
  cancel: (timerId: number) => void = (timerId) => {
    clearInterval(timerId);
  },
): () => void {
  let stopped = false;
  const timerId = schedule(() => {
    if (!stopped) {
      refresh();
    }
  }, intervalMs);

  return () => {
    stopped = true;
    cancel(timerId);
  };
}
