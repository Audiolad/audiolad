/**
 * t1647u: cabinet queue covers must survive a tab remount without a brown flash.
 * The music page unmounts on every visit; a new <img src> would refetch when the
 * cover route is not in the HTTP cache. Keep the decoded bytes as a blob URL,
 * keyed by the stable catalog or workspace-cover path, for the lifetime of the tab.
 */

const blobs = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<(src: string) => void>();

export function resolveCabinetCoverSrc(src: string | null | undefined): string | null {
  const url = src?.trim() ?? "";
  if (!url) return null;
  return blobs.get(url) ?? url;
}

export function isCabinetCoverCached(src: string | null | undefined): boolean {
  const url = src?.trim() ?? "";
  return Boolean(url) && blobs.has(url);
}

export function subscribeCabinetCoverCache(listener: (src: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function preloadCabinetCover(src: string | null | undefined): Promise<void> {
  const url = src?.trim() ?? "";
  if (!url || blobs.has(url)) return Promise.resolve();
  const pending = inflight.get(url);
  if (pending) return pending;
  // Browser tab only: Node tests and SSR must not fetch covers during render.
  if (typeof window === "undefined" || typeof fetch !== "function" || typeof URL.createObjectURL !== "function") {
    return Promise.resolve();
  }
  const request = fetch(url, { credentials: "same-origin", cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("cabinet_cover_unavailable");
      return response.blob();
    })
    .then((blob) => {
      if (blobs.has(url)) return;
      blobs.set(url, URL.createObjectURL(blob));
      for (const listener of listeners) listener(url);
    })
    .catch(() => {
      /* Leave the original src; the img onError path still hides a broken cover. */
    })
    .finally(() => {
      inflight.delete(url);
    });
  inflight.set(url, request);
  return request;
}

export function preloadCabinetCovers(urls: readonly (string | null | undefined)[]): void {
  for (const url of urls) preloadCabinetCover(url);
}

/** Test helper: drop cached blob URLs so cases stay isolated. */
export function resetCabinetCoverCacheForTests(): void {
  for (const objectUrl of blobs.values()) {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function" && objectUrl.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrl);
    }
  }
  blobs.clear();
  inflight.clear();
  listeners.clear();
}
