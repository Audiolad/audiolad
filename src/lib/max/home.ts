import type { PublicCatalogSection } from "@/lib/catalog/catalog-sections";
import type { CatalogAccessFilter } from "@/lib/catalog/listing-contract";
import {
  readMaxCatalogProductList,
  type MaxCatalogProduct,
} from "@/lib/max/catalog-product";

export const MAX_HOME_SHELF_LIMIT = 6;

export const MAX_HOME_TITLE = "АудиоЛад";
export const MAX_HOME_SUBTITLE =
  "Музыка, аудиопрактики, медитации и обучение";
export const MAX_HOME_SEE_ALL_LABEL = "Смотреть все";

/**
 * Fixed Home shelves. Queries are inputs to the canonical MAX catalog,
 * not a second visibility system.
 */
export const MAX_HOME_SHELVES = [
  {
    id: "free",
    title: "Слушайте бесплатно",
    section: null,
    access: "free",
  },
  {
    id: "music",
    title: "Музыка",
    section: "music",
    access: "all",
  },
  {
    id: "meditations",
    title: "Практики и медитации",
    section: "meditations",
    access: "all",
  },
] as const satisfies readonly {
  id: string;
  title: string;
  section: PublicCatalogSection | null;
  access: CatalogAccessFilter;
}[];

export type MaxHomeShelfId = (typeof MAX_HOME_SHELVES)[number]["id"];

export type MaxHomeShelves = Record<MaxHomeShelfId, MaxCatalogProduct[]>;

export function readMaxHomeShelves(payload: unknown): MaxHomeShelves | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const shelves = (payload as { shelves?: unknown }).shelves;
  if (!shelves || typeof shelves !== "object" || Array.isArray(shelves)) {
    return null;
  }

  const record = shelves as Record<string, unknown>;
  const free = readMaxCatalogProductList(record.free);
  const music = readMaxCatalogProductList(record.music);
  const meditations = readMaxCatalogProductList(record.meditations);
  if (!free || !music || !meditations) {
    return null;
  }

  return { free, music, meditations };
}
