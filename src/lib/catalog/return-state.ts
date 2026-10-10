/**
 * Catalog "return" state: lets the regular (web) catalog come back exactly as
 * the visitor left it after opening a product card and going Back.
 *
 * Stored in sessionStorage (per tab, gone when the tab closes), one entry,
 * keyed by the exact catalog URL (path + search: q / topic / filters / sort),
 * and valid for a limited time. The grid decides whether to restore it only on
 * a real history traversal (Back / Forward); a fresh entry into the catalog
 * (link, tab bar, typed URL) always starts from the top.
 *
 * Pure helpers on purpose: storage and clock are injected so the rules can be
 * unit tested without a browser. Not used by the MAX / VK mini apps.
 */
import type { CatalogCard } from "@/lib/catalog/dto";

export const CATALOG_RETURN_STORAGE_KEY = "audiolad:catalog-return:v1";
/** Id of the viewer the stored snapshot belongs to (set on sign-in). */
export const CATALOG_RETURN_VIEWER_KEY = "audiolad:catalog-return:viewer";
export const CATALOG_RETURN_TTL_MS = 30 * 60 * 1000;
export const CATALOG_RETURN_MAX_ITEMS = 240;

export type CatalogReturnSnapshot = {
  v: 1;
  /** Exact catalog URL: pathname + search. */
  href: string;
  /** Signed-in vs guest: cards carry viewer flags (saved, grants). */
  authenticated: boolean;
  items: CatalogCard[];
  nextCursor: string | null;
  scrollY: number;
  savedAt: number;
  /** Product (or other) pathname the visitor opened from the catalog. */
  exitedTo: string | null;
  /** When the visitor clicked through to `exitedTo`; cleared once claimed. */
  exitedAt?: number | null;
};

export type CatalogReturnStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export function isCatalogPath(pathname: string): boolean {
  return pathname === "/catalog" || pathname === "/catalog/";
}

export function isCatalogReturnFresh(
  snapshot: Pick<CatalogReturnSnapshot, "savedAt">,
  now: number,
): boolean {
  const age = now - snapshot.savedAt;
  return Number.isFinite(age) && age >= 0 && age <= CATALOG_RETURN_TTL_MS;
}

function isSnapshot(value: unknown): value is CatalogReturnSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    row.v === 1 &&
    typeof row.href === "string" &&
    typeof row.authenticated === "boolean" &&
    Array.isArray(row.items) &&
    (row.nextCursor === null || typeof row.nextCursor === "string") &&
    typeof row.scrollY === "number" &&
    Number.isFinite(row.scrollY) &&
    typeof row.savedAt === "number" &&
    (row.exitedTo === null || typeof row.exitedTo === "string") &&
    (row.exitedAt === undefined ||
      row.exitedAt === null ||
      typeof row.exitedAt === "number")
  );
}

export function readCatalogReturnSnapshot(
  storage: CatalogReturnStorage | null,
  now: number,
): CatalogReturnSnapshot | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(CATALOG_RETURN_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isSnapshot(parsed) || !isCatalogReturnFresh(parsed, now)) {
      storage.removeItem(CATALOG_RETURN_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeCatalogReturnSnapshot(
  storage: CatalogReturnStorage | null,
  snapshot: CatalogReturnSnapshot,
): boolean {
  if (!storage) {
    return false;
  }

  const items = snapshot.items.slice(0, CATALOG_RETURN_MAX_ITEMS);
  // A truncated window keeps its cursor only if nothing was cut off, otherwise
  // the cursor would skip the dropped cards: better not to save at all.
  if (items.length < snapshot.items.length) {
    clearCatalogReturnSnapshot(storage);
    return false;
  }

  try {
    storage.setItem(
      CATALOG_RETURN_STORAGE_KEY,
      JSON.stringify({ ...snapshot, items }),
    );
    return true;
  } catch {
    // Quota / private mode: restoring is a nicety, never an error.
    return false;
  }
}

export function clearCatalogReturnSnapshot(
  storage: CatalogReturnStorage | null,
): void {
  try {
    storage?.removeItem(CATALOG_RETURN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Snapshot to restore for this mount, or null. Restores only on a history
 * traversal and only for the very same catalog URL.
 */
export function pickCatalogReturnSnapshot(input: {
  storage: CatalogReturnStorage | null;
  href: string;
  authenticated: boolean;
  now: number;
  isHistoryTraversal: boolean;
}): CatalogReturnSnapshot | null {
  if (!input.isHistoryTraversal) {
    clearCatalogReturnSnapshot(input.storage);
    return null;
  }

  const snapshot = readCatalogReturnSnapshot(input.storage, input.now);

  if (snapshot && snapshot.authenticated !== input.authenticated) {
    // Guest <-> signed-in: cards carry viewer flags, never reuse them.
    clearCatalogReturnSnapshot(input.storage);
    return null;
  }

  if (!snapshot || snapshot.href !== input.href || snapshot.items.length === 0) {
    return null;
  }

  return snapshot;
}

function normalizePathname(pathname: string): string {
  try {
    return decodeURI(pathname).replace(/\/+$/, "");
  } catch {
    return pathname.replace(/\/+$/, "");
  }
}

/** Key stored in `history.state` of the product entry opened from the catalog. */
export const CATALOG_BACK_STATE_KEY = "__audioladOpenedFromCatalog";
/** A click on a catalog card is claimed by the product page within this window. */
export const CATALOG_EXIT_CLAIM_WINDOW_MS = 15_000;

/**
 * Called once when a product page mounts. True only for the history entry that
 * was created by clicking a card of the catalog just now; the claim is single
 * use, so later visits to the same product (Home -> product A) are not tagged.
 */
export function claimCatalogExit(input: {
  storage: CatalogReturnStorage | null;
  pathname: string;
  now: number;
}): boolean {
  const snapshot = readCatalogReturnSnapshot(input.storage, input.now);

  if (
    !snapshot ||
    snapshot.exitedTo === null ||
    typeof snapshot.exitedAt !== "number" ||
    input.now - snapshot.exitedAt < 0 ||
    input.now - snapshot.exitedAt > CATALOG_EXIT_CLAIM_WINDOW_MS ||
    normalizePathname(snapshot.exitedTo) !== normalizePathname(input.pathname)
  ) {
    return false;
  }

  try {
    input.storage?.setItem(
      CATALOG_RETURN_STORAGE_KEY,
      JSON.stringify({ ...snapshot, exitedAt: null }),
    );
  } catch {
    // ignore
  }

  return true;
}

/** Is the CURRENT history entry the one opened from the catalog? */
export function isCatalogBackEntry(historyState: unknown): boolean {
  return Boolean(
    historyState &&
      typeof historyState === "object" &&
      (historyState as Record<string, unknown>)[CATALOG_BACK_STATE_KEY] === true,
  );
}

/**
 * Should "← Назад в каталог" behave as browser Back? Only when the previous
 * history entry is the catalog, i.e. this very entry is tagged. A product page
 * reached any other way (Home -> product) gets a normal link to /catalog.
 */
export function shouldUseHistoryBackToCatalog(input: {
  historyState: unknown;
}): boolean {
  return isCatalogBackEntry(input.historyState);
}
