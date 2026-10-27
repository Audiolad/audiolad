export type CatalogPromoAudience = "all" | "guest" | "signed_in";

export type CatalogPromo = {
  id: string;
  title: string;
  image: string;
  caption?: string;
  href: string;
  alt: string;
  position: number;
  startsAt?: string;
  endsAt?: string;
  audience?: CatalogPromoAudience;
  experimentKey?: string;
};

export const CATALOG_PROMOS: readonly CatalogPromo[] = [
  {
    id: "sleep-music-2026-08",
    title: "Музыка и практики для глубокого сна",
    image: "/images/catalog-promo/catalog-promo-sleep-2026-08.webp",
    href: "/catalog?q=сон",
    alt: "Музыка и практики для глубокого сна",
    position: 1,
  },
  {
    id: "womens-money-2026-08",
    title: "Женские деньги",
    image: "/images/catalog-promo/catalog-promo-womens-money-2026-08.webp",
    href: "/practice/zoya-petrova/zhenskie-dengi",
    alt: "Женские деньги",
    position: 2,
  },
  {
    id: "create-audio-2026-08",
    title: "Создавай свои аудиопрактики",
    image: "/images/catalog-promo/catalog-promo-create-audio-2026-08.webp",
    href: "/studio/meditation",
    alt: "Создавай свои аудиопрактики",
    position: 3,
  },
];

export function isCatalogPromoActive(
  promo: CatalogPromo,
  now: Date = new Date(),
): boolean {
  if (promo.startsAt && now < new Date(promo.startsAt)) {
    return false;
  }

  if (promo.endsAt && now > new Date(promo.endsAt)) {
    return false;
  }

  return true;
}

export function listCatalogPromos(now: Date = new Date()): CatalogPromo[] {
  return CATALOG_PROMOS.filter((promo) => isCatalogPromoActive(promo, now)).sort(
    (left, right) => left.position - right.position,
  );
}

/** Only local assets or HTTPS images; links stay on Audiolad owned hosts. */
export function isPromoImageUrl(value: string): boolean {
  if (/^\/(?!\/)[^\\\s?#]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isPromoHref(value: string): boolean {
  if (/^\/(?!\/)[^\\\s]*$/.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "audiolad.ru" || url.hostname.endsWith(".audiolad.ru"))
    );
  } catch {
    return false;
  }
}

export type ManagedCatalogPromo = {
  id: "catalog";
  enabled: boolean;
  title: string;
  caption: string;
  image: string;
  href: string;
};

export function parseManagedCatalogPromo(value: unknown): ManagedCatalogPromo | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.id !== "catalog" || typeof row.enabled !== "boolean") return null;
  const fields = { title: 120, caption: 240, image: 2048, href: 2048 } as const;
  for (const [key, limit] of Object.entries(fields)) {
    if (typeof row[key] !== "string" || (row[key] as string).length > limit) return null;
  }
  const promo = {
    id: "catalog" as const,
    enabled: row.enabled,
    title: (row.title as string).trim(),
    caption: (row.caption as string).trim(),
    image: (row.image as string).trim(),
    href: (row.href as string).trim(),
  };
  if (!promo.title || !isPromoImageUrl(promo.image) || !isPromoHref(promo.href)) return null;
  return promo;
}

export function toCatalogPromos(value: unknown): CatalogPromo[] {
  const promo = parseManagedCatalogPromo(value);
  return promo?.enabled ? [{
    id: promo.id,
    title: promo.title,
    caption: promo.caption,
    image: promo.image,
    href: promo.href,
    alt: "",
    position: 1,
  }] : [];
}

/**
 * Wide school photo. The title is baked into the pixels, so the catalog
 * shows the file itself instead of a thumbnail plus a second heading.
 * The file is replaced separately. Layout follows the image's own ratio.
 */
export const CATALOG_PROMO_ARTWORK_PATH = "/images/catalog-promo/school-audiopraktik.webp";

export function isCatalogPromoArtwork(image: string): boolean {
  const path = image.trim().split(/[?#]/, 1)[0] ?? "";
  return path.endsWith("/school-audiopraktik.webp");
}

/**
 * Cards of the first catalog page before the single full-width promo row.
 * Page size is 20, so card 12 is always on page 1 when the listing is that long.
 */
export const CATALOG_GRID_PROMO_AFTER_PRODUCTS = 12;

/**
 * 0-based product index after which the promo row is inserted.
 * Shorter listings place it after the last card. Null when the grid is empty.
 * The same index is used for every later page, so the row is not repeated.
 */
export function catalogGridPromoInsertAfter(productCount: number): number | null {
  if (!Number.isInteger(productCount) || productCount <= 0) {
    return null;
  }

  return Math.min(CATALOG_GRID_PROMO_AFTER_PRODUCTS, productCount) - 1;
}
