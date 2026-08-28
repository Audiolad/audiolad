/**
 * Catalog Listing Freeze v2 — public READ contract.
 *
 * New catalog frontend may consume only these types.
 * Legacy fields (practices, PracticeRow, product_kind, format, program,
 * price, is_free, audio_items) stay behind the adapter.
 */

export const CATALOG_PUBLICATION_CLASSES = [
  "practice",
  "course",
  "audiobook",
  "release",
  "post",
] as const;

export type PublicationClass = (typeof CATALOG_PUBLICATION_CLASSES)[number];

export const CATALOG_CLASS_LABELS: Record<PublicationClass, string> = {
  practice: "Практика",
  course: "Курс",
  audiobook: "Аудиокнига",
  release: "Релиз",
  post: "Пост",
};

export const CATALOG_MONEY_CURRENCY = "RUB" as const;

export type CatalogMoney = {
  amount_minor: number;
  currency: typeof CATALOG_MONEY_CURRENCY;
};

export type CatalogOfferAccess = "free" | "paid";

export type CatalogFreeOffer = {
  access: "free";
  claim: "free_claim";
  price: null;
};

export type CatalogPaidOffer = {
  access: "paid";
  price: CatalogMoney;
  compare_at_price?: CatalogMoney | null;
};

export type CatalogDefaultOffer = CatalogFreeOffer | CatalogPaidOffer | null;

export type CatalogViewer = {
  can_listen: boolean;
  has_grant: boolean;
  is_saved: boolean;
};

export type CatalogSlide = {
  id: string;
  image_url: string;
  position: number;
  alt: string;
};

export type CatalogCover = {
  url: string | null;
  alt: string;
  image?: unknown;
  updated_at?: string | null;
};

export type CatalogCardAuthor = {
  name: string;
  slug: string;
};

export type CatalogTopicRef = {
  key: string;
  title: string;
};

export type CatalogCardPaths = {
  pdp: string;
};

/**
 * Reserved class-specific read model.
 * Must not carry audio_items, format, program, or legacy price fields.
 */
export type CatalogCardSummary = Record<string, never>;

export type CatalogCardProgress = null;

export type CatalogCard = {
  publication_id: string;
  class: PublicationClass;
  slug: string;
  title: string;
  subtitle: string | null;
  cover: CatalogCover;
  gallery: CatalogSlide[];
  author: CatalogCardAuthor;
  topics: CatalogTopicRef[];
  display_label: string;
  duration_seconds: number | null;
  published_at: string | null;
  paths: CatalogCardPaths;
  default_offer: CatalogDefaultOffer;
  viewer: CatalogViewer;
  badges: string[];
  progress: CatalogCardProgress;
  summary: CatalogCardSummary;
};

export type CatalogCardActionTarget = {
  id: string;
  slug: string;
  href: string;
  isSaved: boolean;
};

export function isPublicationClass(
  value: string | null | undefined,
): value is PublicationClass {
  return (
    typeof value === "string" &&
    (CATALOG_PUBLICATION_CLASSES as readonly string[]).includes(value)
  );
}

export function getCatalogClassLabel(
  publicationClass: PublicationClass,
): string {
  return CATALOG_CLASS_LABELS[publicationClass];
}

export function catalogCardToActionTarget(
  card: CatalogCard,
): CatalogCardActionTarget {
  return {
    id: card.publication_id,
    slug: card.slug,
    href: card.paths.pdp,
    isSaved: card.viewer.is_saved,
  };
}

export function getCatalogOfferAccess(
  offer: CatalogDefaultOffer,
): CatalogOfferAccess | null {
  return offer?.access ?? null;
}
