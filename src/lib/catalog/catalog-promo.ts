export type CatalogPromoAudience = "all" | "guest" | "signed_in";

export type CatalogPromo = {
  id: string;
  title: string;
  image: string;
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
