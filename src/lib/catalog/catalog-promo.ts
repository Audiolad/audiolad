import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";
import { SCHOOL_ORIGIN } from "@/lib/school/host";

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
    id: "become-author",
    title: "Стать автором на АудиоЛад",
    image: "/images/banners/become-author-mobile-banner-v1.webp",
    href: BECOME_AUTHOR_HREF,
    alt: "Стать автором на АудиоЛад",
    position: 1,
  },
  {
    id: "school",
    title: "Школа Аудиопрактик",
    image: "/images/catalog-promo/school.svg",
    href: SCHOOL_ORIGIN,
    alt: "Школа Аудиопрактик",
    position: 2,
  },
  {
    id: "catalog-gifts",
    title: "Подарки авторов",
    image: "/images/catalog-promo/gifts.svg",
    href: "/catalog?access=free",
    alt: "Подарки авторов платформы",
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
