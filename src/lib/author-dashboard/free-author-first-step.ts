import {
  isAuthorCommercialApprovedAccess,
  type AuthorAccessStatus,
} from "@/lib/authors/access";

/** First-step banner for free / pending authors (replaces terms→commercial funnel). */
export const FREE_AUTHOR_FIRST_PRODUCT_BANNER = {
  title: "Создайте первый бесплатный продукт",
  body: "Вы уже можете создать бесплатную аудиопрактику, музыку или альбом и отправить его на модерацию. Коммерческий статус понадобится только для продажи платных продуктов.",
  ctaLabel: "Создать бесплатный продукт",
  secondaryCtaLabel: "Мои продукты",
} as const;

export const FREE_AUTHOR_PRODUCTS_EMPTY_STATE = {
  title: "Создайте первый бесплатный продукт",
  body: "Добавьте аудиопрактику, музыку или альбом. После заполнения отправьте продукт на модерацию.",
  ctaLabel: "Создать бесплатный продукт",
} as const;

/** Status-page hint when commercial CTA is gated by published free product. */
export const STARTER_FREE_PRODUCT_BEFORE_COMMERCIAL_HINT =
  "Сначала опубликуйте один бесплатный продукт. После этого вы сможете подать заявку на коммерческий статус и продавать платные материалы.";

export const AUTHOR_PRODUCT_FREE_PRICE_LABEL = "Бесплатно";

export const PAID_PRICING_FREE_AUTHOR_HINT =
  "Коммерческий статус нужен только для продажи. Бесплатный продукт можно создать и отправить на модерацию уже сейчас.";

export const PAID_PRICING_COMMERCIAL_STATUS_MORE_LABEL =
  "Подробнее о коммерческом статусе";

/** Terms acceptance CTA is only relevant after commercial approval. */
export function shouldShowAuthorTermsRequiredBanner(
  accessStatus: AuthorAccessStatus | string | null | undefined,
): boolean {
  return isAuthorCommercialApprovedAccess(accessStatus);
}

/**
 * First free-product nudge for authors who are not yet commercially approved.
 * Pass productCount < 0 while the product list is still loading.
 */
export function shouldShowFreeAuthorFirstProductBanner(
  accessStatus: AuthorAccessStatus | string | null | undefined,
  productCount: number,
): boolean {
  if (productCount < 0 || productCount > 0) {
    return false;
  }

  return (
    accessStatus === "free" ||
    accessStatus === "commercial_pending"
  );
}

export function buildAuthorNewProductHref(authorSlug: string): string {
  return `/author-dashboard/products/new?author=${encodeURIComponent(authorSlug)}`;
}

export function buildAuthorDashboardHref(authorSlug: string): string {
  return `/author-dashboard?author=${encodeURIComponent(authorSlug)}`;
}

export function buildCommercialStatusHelpHref(): string {
  return "/help/finance/commercial-status";
}

export function buildAuthorStatusHref(authorSlug: string): string {
  return `/author-dashboard/status?author=${encodeURIComponent(authorSlug)}`;
}
