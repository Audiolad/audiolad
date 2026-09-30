import type { CatalogCard } from "@/lib/catalog/dto";
import {
  buildCatalogListingApiUrl,
  CATALOG_LISTING_PAGE_SIZE,
  type CatalogListingQuery,
  type CatalogListingResult,
} from "@/lib/catalog/listing-contract";
import { peekLibrarySave } from "@/lib/library/saves-sync";

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

/** Realtime table. Rows contain no product id, slug, title, or visibility. */
export const PUBLIC_CONTENT_REVISION_TABLE = "public_content_revision";

/** Scope bumped by practice and topic triggers. Catalog listens to this row. */
export const PUBLIC_CONTENT_REVISION_SCOPE = "practices";

/** Light fallback. Claims due schedules, then returns only the revision. */
export const PUBLIC_CONTENT_REVISION_API_PATH = "/api/public-content/revision";

/** Extra pages allowed when a new item shifts the loaded anchor down. */
export const CATALOG_LIVE_REFRESH_PAGE_HEADROOM = 2;

export const PUBLIC_REVISION_CHILD_TABLES = [
  "practice_topics",
  "practice_price_promotions",
  "publication_gallery_slides",
  "audio_items",
] as const;

export const PUBLIC_REVISION_PARENT_TABLES = ["authors", "topics"] as const;

/** Visitor-specific rows. A change here must not bump the global revision. */
export const PUBLIC_REVISION_EXCLUDED_TABLES = ["practice_price_promotion_starts"] as const;

export type PublicContentRevisionRow = {
  scope: string;
  revision: number;
  updated_at: string;
};

/**
 * Fields a browser is allowed to observe from the revision table.
 * Any other key on the payload is dropped.
 */
export function clientVisibleRevisionRow(row: object): PublicContentRevisionRow | null {
  const record = row as Record<string, unknown>;
  const scope = record.scope;
  const revision = parsePublicContentRevision(record.revision);
  const updatedAt = record.updated_at;

  if (typeof scope !== "string" || revision == null || typeof updatedAt !== "string") {
    return null;
  }

  return {
    scope,
    revision,
    updated_at: updatedAt,
  };
}

/** Reads the new revision row from a postgres_changes payload and nothing else. */
export function revisionRowFromRealtimePayload(payload: unknown): object {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const next = (payload as { new?: unknown }).new;

  if (!next || typeof next !== "object") {
    return {};
  }

  return next;
}

export function parsePublicContentRevision(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Remember the newest revision. The first sample is a baseline.
 * A later higher value means a change was missed or just landed.
 * A stale lower read does not move the cursor backward.
 */
export function nextRevisionAction(
  lastSeen: number | null,
  current: number | null,
): { lastSeen: number | null; refresh: boolean } {
  if (current == null || !Number.isFinite(current)) {
    return { lastSeen, refresh: false };
  }

  if (lastSeen == null) {
    return { lastSeen: current, refresh: false };
  }

  if (current > lastSeen) {
    return { lastSeen: current, refresh: true };
  }

  return { lastSeen, refresh: false };
}

export function relatedChangeBumpsPublicRevision(input: {
  table: string;
  publicSurface: boolean;
}): boolean {
  if ((PUBLIC_REVISION_EXCLUDED_TABLES as readonly string[]).includes(input.table)) {
    return false;
  }

  const watched = new Set<string>([
    "practices",
    ...PUBLIC_REVISION_CHILD_TABLES,
    ...PUBLIC_REVISION_PARENT_TABLES,
  ]);

  if (!watched.has(input.table)) {
    return false;
  }

  return input.publicSurface;
}

export type PracticeSurfaceSnapshot = {
  status: string | null;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  catalogVisibility: string | null;
};

/**
 * Mirrors public.practice_affects_public_surface / practice_is_publicly_available.
 * Listed and unlisted published rows are on the public surface. Other modes are not.
 */
export function practiceAffectsPublicSurface(
  row: PracticeSurfaceSnapshot | null,
  atMs: number,
): boolean {
  if (!row || row.deletedAt) {
    return false;
  }

  if (row.catalogVisibility !== "listed" && row.catalogVisibility !== "unlisted") {
    return false;
  }

  if (row.status !== "published") {
    return false;
  }

  if (row.publishedAt) {
    const publishedMs = Date.parse(row.publishedAt);

    if (Number.isFinite(publishedMs) && publishedMs <= atMs) {
      return true;
    }
  }

  if (!row.scheduledPublishAt) {
    return true;
  }

  const scheduledMs = Date.parse(row.scheduledPublishAt);
  return Number.isFinite(scheduledMs) && scheduledMs <= atMs;
}

export function shouldBumpPublicContentRevision(input: {
  operation: "INSERT" | "UPDATE" | "DELETE";
  previous: PracticeSurfaceSnapshot | null;
  next: PracticeSurfaceSnapshot | null;
  atMs?: number;
}): boolean {
  const atMs = input.atMs ?? Date.now();
  const previousPublic =
    input.operation !== "INSERT" && practiceAffectsPublicSurface(input.previous, atMs);
  const nextPublic =
    input.operation !== "DELETE" && practiceAffectsPublicSurface(input.next, atMs);

  return previousPublic || nextPublic;
}

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

/**
 * Server viewer flags stay authoritative. The only local overlay is an
 * in-tab library save. Grant and listen access always come from `next`.
 */
export function applyLocalLibrarySave(
  next: CatalogCard,
  localSaved: boolean | null,
): CatalogCard {
  if (localSaved == null || localSaved === next.viewer.is_saved) {
    return next;
  }

  return {
    ...next,
    viewer: {
      ...next.viewer,
      is_saved: localSaved,
    },
  };
}

export function mergePublicCatalogCard(next: CatalogCard): CatalogCard {
  return applyLocalLibrarySave(next, peekLibrarySave(next.publication_id));
}

export function mergeLoadedCatalogWindow(fetched: readonly CatalogCard[]): CatalogCard[] {
  const seen = new Set<string>();
  const items: CatalogCard[] = [];

  for (const item of fetched) {
    if (!item?.publication_id || seen.has(item.publication_id)) {
      continue;
    }

    seen.add(item.publication_id);
    items.push(mergePublicCatalogCard(item));
  }

  return items;
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
  query: CatalogListingQuery,
  fetchImpl: CatalogFetch = fetch,
): Promise<CatalogListingResult | null> {
  try {
    const response = await fetchImpl(buildCatalogListingApiUrl(query), {
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

/**
 * HTTP page budget for a live refetch. Uses loaded pages, not item count.
 * Headroom covers an insert that pushes the anchor onto the next page.
 * A missing anchor stops at this cap instead of walking the whole catalog.
 */
export function catalogLiveRefreshPageCap(loadedCount: number, pageSize: number): number {
  const size = Math.max(1, Math.floor(pageSize) || 1);

  if (loadedCount <= 0) {
    return 1;
  }

  return Math.ceil(loadedCount / size) + CATALOG_LIVE_REFRESH_PAGE_HEADROOM;
}

/**
 * Re-read the public listing until the last id the user already loaded is
 * inside the fetched prefix, the page cap is hit, or the listing ends.
 * Full pages are kept so the returned cursor still points at the next unread page.
 */
export async function fetchCatalogListingToLoadedDepth(
  query: Omit<CatalogListingQuery, "cursor">,
  loadedIds: readonly string[],
  fetchImpl: CatalogFetch = fetch,
): Promise<CatalogListingResult | null> {
  const anchor = loadedIds.length > 0 ? loadedIds[loadedIds.length - 1] : null;
  const items: CatalogCard[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let nextCursor: string | null = null;
  const pageSize = Math.max(1, Math.floor(query.limit) || CATALOG_LISTING_PAGE_SIZE);
  const maxPages = catalogLiveRefreshPageCap(loadedIds.length, pageSize);

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await fetchCatalogListingPage({ ...query, cursor }, fetchImpl);

    if (!page) {
      return null;
    }

    if (page.items.length === 0) {
      nextCursor = page.nextCursor;
      break;
    }

    for (const item of page.items) {
      if (!item?.publication_id || seen.has(item.publication_id)) {
        continue;
      }

      seen.add(item.publication_id);
      items.push(item);
    }

    nextCursor = page.nextCursor;
    cursor = page.nextCursor;

    if (anchor == null || seen.has(anchor) || !page.nextCursor) {
      break;
    }
  }

  return { items, nextCursor };
}

export function createSerialTaskQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export function revisionProbeToken(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const revision = parsePublicContentRevision((body as { revision?: unknown }).revision);

  if (revision == null) {
    return null;
  }

  return String(revision);
}

/** Visible-tab fallback. The body is only the revision number. */
export async function probePublicContentRevision(
  fetchImpl: CatalogFetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(PUBLIC_CONTENT_REVISION_API_PATH, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return revisionProbeToken(await response.json());
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
      cursor: null,
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
