import { getAppOrigin } from "@/lib/seo/app-origin";

export function buildQuickOfferPath(slug: string): string {
  return `/offers/${slug.trim()}`;
}

export function buildQuickOfferUrl(origin: string, slug: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildQuickOfferPath(slug)}`;
}

export function buildQuickOfferCanonicalUrl(slug: string): string {
  return buildQuickOfferUrl(getAppOrigin(), slug);
}
