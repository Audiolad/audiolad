import type { PublicPromoPageCtaBlock } from "@/lib/promo-pages/types";

export type MaxPromoProduct = {
  practiceId: string;
  slug: string;
  title: string;
  format: string | null;
  durationMinutes: number | null;
  coverUrl: string | null;
  authorName: string;
  authorSlug: string;
};

export type MaxPromoPage = {
  promoPageId: string;
  authorSlug: string;
  promoSlug: string;
  publicTitle: string;
  publicDescription: string | null;
  footerText: string | null;
  bannerUrl: string | null;
  authorName: string | null;
  cta: PublicPromoPageCtaBlock | null;
  products: MaxPromoProduct[];
};

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function readCta(value: unknown): PublicPromoPageCtaBlock | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const cta = value as Record<string, unknown>;
  const heading = nullableString(cta.heading);
  const description = nullableString(cta.description);
  const host = nullableString(cta.host);
  if (
    heading === undefined ||
    description === undefined ||
    host === undefined ||
    typeof cta.label !== "string" ||
    typeof cta.href !== "string" ||
    (cta.kind !== "internal" && cta.kind !== "external") ||
    typeof cta.openInNewTab !== "boolean"
  ) {
    return undefined;
  }
  return {
    heading,
    description,
    label: cta.label,
    href: cta.href,
    kind: cta.kind,
    host,
    openInNewTab: cta.openInNewTab,
  };
}

export function readMaxPromoPage(value: unknown): MaxPromoPage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = value as Record<string, unknown>;
  const publicDescription = nullableString(page.publicDescription);
  const footerText = nullableString(page.footerText);
  const bannerUrl = nullableString(page.bannerUrl);
  const authorName = nullableString(page.authorName);
  const cta = readCta(page.cta);
  if (
    typeof page.promoPageId !== "string" ||
    typeof page.authorSlug !== "string" ||
    typeof page.promoSlug !== "string" ||
    typeof page.publicTitle !== "string" ||
    publicDescription === undefined ||
    footerText === undefined ||
    bannerUrl === undefined ||
    authorName === undefined ||
    cta === undefined ||
    !Array.isArray(page.products)
  ) {
    return null;
  }

  const products: MaxPromoProduct[] = [];
  for (const item of page.products) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const product = item as Record<string, unknown>;
    const format = nullableString(product.format);
    const coverUrl = nullableString(product.coverUrl);
    if (
      typeof product.practiceId !== "string" ||
      typeof product.slug !== "string" ||
      typeof product.title !== "string" ||
      format === undefined ||
      !(
        product.durationMinutes === null ||
        typeof product.durationMinutes === "number"
      ) ||
      coverUrl === undefined ||
      typeof product.authorName !== "string" ||
      typeof product.authorSlug !== "string"
    ) {
      return null;
    }
    products.push({
      practiceId: product.practiceId,
      slug: product.slug,
      title: product.title,
      format,
      durationMinutes: product.durationMinutes as number | null,
      coverUrl,
      authorName: product.authorName,
      authorSlug: product.authorSlug,
    });
  }

  if (products.length < 1) return null;

  return {
    promoPageId: page.promoPageId,
    authorSlug: page.authorSlug,
    promoSlug: page.promoSlug,
    publicTitle: page.publicTitle,
    publicDescription,
    footerText,
    bannerUrl,
    authorName,
    cta,
    products,
  };
}
