import type { CatalogCard } from "@/lib/catalog/dto";
import {
  buildCatalogListingApiUrl,
  type CatalogListingQuery,
  type CatalogListingResult,
} from "@/lib/catalog/listing-contract";

/** Coalesce bursts of Realtime events into one public reload. */
export const LIVE_PUBLIC_CONTENT_DEBOUNCE_MS = 600;

/**
 * Visible-tab fallback. Scheduled release may not emit a row change until a
 * server request claims it, so open tabs recheck on this cadence.
 */
export const LIVE_PUBLIC_CONTENT_FALLBACK_MS = 45_000;

/** Newest public cards used as a light freshness probe, not a full listing. */
export const PUBLIC_CATALOG_PROBE_LIMIT = 8;

export const REALTIME_RECONNECT_BASE_MS = 500;
export const REALTIME_RECONNECT_MAX_MS = 30_000;

export type PublicContentSignalSource = "realtime" | "fallback" | "visibility";

/**
 * Realtime payloads are change signals only. Row fields are never copied
 * onto the signal and must not be rendered.
 */
export type PublicContentSignal = {
  source: PublicContentSignalSource;
};

export function signalFromRealtimePayload(payload: unknown): PublicContentSignal {
  void payload;
  return { source: "realtime" };
}

export function shouldResubscribeRealtime(status: string, stopped: boolean): boolean {
  if (stopped) {
    return false;
  }

  return status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED";
}

export function realtimeReconnectDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt, 8));
  return Math.min(
    REALTIME_RECONNECT_MAX_MS,
    REALTIME_RECONNECT_BASE_MS * 2 ** exponent,
  );
}

export type PublicCatalogFingerprintCard = {
  publication_id?: string;
  title?: string;
  slug?: string;
  cover?: { url?: string | null; updated_at?: string | null } | null;
};

/** Public listing identity only. Viewer, visibility mode, and private columns are omitted. */
export function fingerprintPublicCatalogCards(
  items: readonly PublicCatalogFingerprintCard[],
): string {
  return items
    .map((item) =>
      [
        item.publication_id ?? "",
        item.title ?? "",
        item.slug ?? "",
        item.cover?.url ?? "",
        item.cover?.updated_at ?? "",
      ].join("\u001f"),
    )
    .join("\u001e");
}

export function restoreWindowScrollY(y: number): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.scrollY !== y) {
    window.scrollTo(0, y);
  }
}

export function mergePublicCatalogCard(
  previous: CatalogCard | undefined,
  next: CatalogCard,
): CatalogCard {
  if (!previous) {
    return next;
  }

  return {
    ...next,
    viewer: {
      can_listen: previous.viewer.can_listen || next.viewer.can_listen,
      has_grant: previous.viewer.has_grant || next.viewer.has_grant,
      is_saved: previous.viewer.is_saved || next.viewer.is_saved,
    },
  };
}

export function replaceCatalogPageOne(
  current: readonly CatalogCard[],
  pageOne: readonly CatalogCard[],
  pageSize: number,
): { items: CatalogCard[]; tailCount: number } {
  const safePageSize = Math.max(1, Math.floor(pageSize) || 1);
  const previousById = new Map(current.map((item) => [item.publication_id, item]));
  const seen = new Set<string>();
  const head: CatalogCard[] = [];

  for (const item of pageOne) {
    if (!item?.publication_id || seen.has(item.publication_id)) {
      continue;
    }

    seen.add(item.publication_id);
    head.push(mergePublicCatalogCard(previousById.get(item.publication_id), item));
  }

  const tail: CatalogCard[] = [];
  const tailStart = Math.min(safePageSize, current.length);

  for (const item of current.slice(tailStart)) {
    if (!item?.publication_id || seen.has(item.publication_id)) {
      continue;
    }

    seen.add(item.publication_id);
    tail.push(item);
  }

  return { items: [...head, ...tail], tailCount: tail.length };
}

export function resolveNextCursorAfterPageReplace(input: {
  tailCount: number;
  previousCursor: string | null;
  freshCursor: string | null;
}): string | null {
  if (input.tailCount > 0) {
    return input.previousCursor;
  }

  return input.freshCursor;
}

export function catalogListingUnchanged(
  current: readonly CatalogCard[],
  next: readonly CatalogCard[],
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((item, index) => {
    const other = next[index];

    if (!other) {
      return false;
    }

    return (
      item.publication_id === other.publication_id &&
      item.title === other.title &&
      item.slug === other.slug &&
      item.cover.url === other.cover.url &&
      (item.cover.updated_at ?? null) === (other.cover.updated_at ?? null) &&
      item.viewer.can_listen === other.viewer.can_listen &&
      item.viewer.has_grant === other.viewer.has_grant &&
      item.viewer.is_saved === other.viewer.is_saved
    );
  });
}

type CatalogFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "json">>;

export async function fetchCatalogListingPage(
  query: Omit<CatalogListingQuery, "cursor">,
  fetchImpl: CatalogFetch = fetch,
): Promise<CatalogListingResult | null> {
  try {
    const response = await fetchImpl(buildCatalogListingApiUrl({ ...query, cursor: null }), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      items?: unknown;
      nextCursor?: unknown;
    };
    const items = Array.isArray(payload.items)
      ? payload.items.filter((item): item is CatalogCard => {
          return (
            typeof item === "object" &&
            item !== null &&
            typeof (item as CatalogCard).publication_id === "string"
          );
        })
      : [];

    return {
      items,
      nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
    };
  } catch {
    return null;
  }
}

export async function probePublicCatalogHead(
  fetchImpl: CatalogFetch = fetch,
): Promise<string | null> {
  const page = await fetchCatalogListingPage(
    {
      q: "",
      topic: null,
      section: null,
      access: "all",
      class: "all",
      sort: "new",
      limit: PUBLIC_CATALOG_PROBE_LIMIT,
    },
    fetchImpl,
  );

  if (!page) {
    return null;
  }

  return fingerprintPublicCatalogCards(page.items);
}

export type LiveSyncClock = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
};

export type LivePublicContentControllerOptions = {
  refresh: () => Promise<void> | void;
  probe: () => Promise<string | null>;
  getVisibility: () => "visible" | "hidden";
  subscribeVisibility: (listener: () => void) => () => void;
  clock?: LiveSyncClock;
  debounceMs?: number;
  fallbackIntervalMs?: number;
};

export type LivePublicContentController = {
  start: () => () => void;
  signal: (source?: PublicContentSignalSource) => void;
};

export function createLivePublicContentController(
  options: LivePublicContentControllerOptions,
): LivePublicContentController {
  const clock: LiveSyncClock = options.clock ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  };
  const debounceMs = options.debounceMs ?? LIVE_PUBLIC_CONTENT_DEBOUNCE_MS;
  const fallbackIntervalMs = options.fallbackIntervalMs ?? LIVE_PUBLIC_CONTENT_FALLBACK_MS;

  let stopped = false;
  let timer: unknown = null;
  let interval: unknown = null;
  let pendingDelay = Number.POSITIVE_INFINITY;
  let inFlight = false;
  let queued = false;
  let lastFingerprint: string | null = null;

  function clearTimer() {
    if (timer != null) {
      clock.clearTimeout(timer);
      timer = null;
    }

    pendingDelay = Number.POSITIVE_INFINITY;
  }

  function schedule(delay: number) {
    if (stopped) {
      return;
    }

    if (inFlight) {
      queued = true;
      return;
    }

    const wait = Math.max(0, delay);

    if (timer != null && wait >= pendingDelay) {
      return;
    }

    clearTimer();
    pendingDelay = wait;
    timer = clock.setTimeout(() => {
      timer = null;
      pendingDelay = Number.POSITIVE_INFINITY;
      void runRefresh();
    }, wait);
  }

  async function runRefresh() {
    if (stopped) {
      return;
    }

    if (inFlight) {
      queued = true;
      return;
    }

    inFlight = true;
    queued = false;

    try {
      await options.refresh();

      if (stopped) {
        return;
      }

      try {
        const fingerprint = await options.probe();

        if (!stopped && fingerprint != null) {
          lastFingerprint = fingerprint;
        }
      } catch {
        // A failed probe keeps the previous fingerprint so the next
        // visible check can try again.
      }
    } finally {
      inFlight = false;

      if (!stopped && queued) {
        queued = false;
        schedule(debounceMs);
      }
    }
  }

  async function runProbe() {
    if (stopped || options.getVisibility() !== "visible") {
      return;
    }

    let fingerprint: string | null;

    try {
      fingerprint = await options.probe();
    } catch {
      return;
    }

    if (stopped || fingerprint == null) {
      return;
    }

    if (lastFingerprint == null) {
      lastFingerprint = fingerprint;
      return;
    }

    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      schedule(debounceMs);
    }
  }

  return {
    signal(source: PublicContentSignalSource = "realtime") {
      if (source === "visibility") {
        schedule(0);
        return;
      }

      schedule(debounceMs);
    },
    start() {
      const unsubscribe = options.subscribeVisibility(() => {
        if (options.getVisibility() === "visible") {
          schedule(0);
        }
      });

      interval = clock.setInterval(() => {
        void runProbe();
      }, fallbackIntervalMs);

      void runProbe();

      return () => {
        stopped = true;
        queued = false;
        unsubscribe();
        clearTimer();

        if (interval != null) {
          clock.clearInterval(interval);
          interval = null;
        }
      };
    },
  };
}
