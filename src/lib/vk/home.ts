import "server-only";

import { readMaxCatalogProduct, type MaxCatalogProduct } from "@/lib/max/catalog-product";
import {
  MAX_HOME_SHELF_LIMIT,
  MAX_HOME_SHELVES,
  type MaxHomeShelves,
} from "@/lib/max/home";
import { loadVkGuestCatalog } from "@/lib/vk/catalog";

function catalogInputForShelf(shelf: (typeof MAX_HOME_SHELVES)[number]) {
  return {
    ...(shelf.section ? { section: shelf.section } : {}),
    ...(shelf.access !== "all" ? { access: shelf.access } : {}),
  };
}

function toShelfItems(
  items: MaxCatalogProduct[] | null,
): MaxCatalogProduct[] | null {
  if (!items) return null;
  return items.slice(0, MAX_HOME_SHELF_LIMIT).flatMap((item) => {
    const safe = readMaxCatalogProduct(item);
    return safe ? [safe] : [];
  });
}

/** Guest home shelves use the same canonical queries as the MAX home. */
export async function loadVkGuestHomeShelves(): Promise<
  | { ok: true; shelves: MaxHomeShelves }
  | { ok: false; reason: "storage_unavailable" }
> {
  const settled = await Promise.all(
    MAX_HOME_SHELVES.map(async (shelf) => {
      const catalog = await loadVkGuestCatalog(catalogInputForShelf(shelf));
      return { id: shelf.id, catalog };
    }),
  );

  const shelves = {} as MaxHomeShelves;
  for (const entry of settled) {
    if (!entry.catalog.ok) return { ok: false, reason: "storage_unavailable" };
    const items = toShelfItems(entry.catalog.items);
    if (!items) return { ok: false, reason: "storage_unavailable" };
    shelves[entry.id] = items;
  }

  return { ok: true, shelves };
}
