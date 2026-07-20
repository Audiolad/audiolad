import { getAppOrigin } from "@/lib/seo/app-origin";

export function buildPromoPagePath(
  authorSlug: string,
  promoSlug: string,
): string {
  return `/promo/${authorSlug.trim()}/${promoSlug.trim()}`;
}

export function buildPromoPageUrl(
  origin: string,
  authorSlug: string,
  promoSlug: string,
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildPromoPagePath(authorSlug, promoSlug)}`;
}

export function buildPromoPageCanonicalUrl(
  authorSlug: string,
  promoSlug: string,
): string {
  return buildPromoPageUrl(getAppOrigin(), authorSlug, promoSlug);
}

export function buildAuthorPageCtaPreset(authorSlug: string): {
  label: string;
  href: string;
} {
  return {
    label: "Больше практик автора",
    href: `/authors/${authorSlug.trim()}`,
  };
}
