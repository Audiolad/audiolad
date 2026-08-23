export const QUICK_OFFER_TEMPLATE_KEY = "catalog/quick-offer";

export const QUICK_OFFER_STATUSES = ["draft", "published"] as const;

export type QuickOfferStatus = (typeof QUICK_OFFER_STATUSES)[number];

export const QUICK_OFFER_FORMAT_PRESETS = [
  "PDF",
  "Аудио",
  "Видео",
  "ZIP",
  "Бонус",
  "Курс",
] as const;

export type QuickOfferFormatPreset = (typeof QUICK_OFFER_FORMAT_PRESETS)[number];

export const QUICK_OFFER_TIMER_PRESETS_SECONDS = [
  600, 900, 1200, 1800, 3600,
] as const;

export const QUICK_OFFER_DEFAULT_TIMER_SECONDS = 1200;
export const QUICK_OFFER_DEFAULT_CTA_TEXT = "Получить за {price} ₽";
export const QUICK_OFFER_MAX_MATERIALS = 60;

export type QuickOfferMaterialRecord = {
  id: string;
  offer_id: string;
  image_path: string | null;
  image_url: string | null;
  format_label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type QuickOfferRecord = {
  id: string;
  author_id: string;
  practice_id: string;
  title: string;
  slug: string;
  hero_image_path: string | null;
  hero_image_url: string | null;
  short_description: string;
  promo_price: number;
  cta_text: string;
  timer_duration_seconds: number;
  status: QuickOfferStatus;
  template_key: string;
  mid_cta_after_count: number | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuickOfferProductSnapshot = {
  practice_id: string;
  slug: string;
  title: string;
  status: string;
  is_free: boolean;
  price: number;
  author_id: string;
};

export type QuickOfferAdminDto = QuickOfferRecord & {
  product: QuickOfferProductSnapshot | null;
  materials: QuickOfferMaterialRecord[];
  public_path: string;
};

export type QuickOfferListItem = Pick<
  QuickOfferRecord,
  | "id"
  | "author_id"
  | "practice_id"
  | "title"
  | "slug"
  | "promo_price"
  | "status"
  | "template_key"
  | "published_at"
  | "created_at"
  | "updated_at"
> & {
  material_count: number;
  product_title: string | null;
  product_price: number | null;
  public_path: string;
};

export type PublicQuickOfferMaterialDto = {
  id: string;
  image_url: string | null;
  format_label: string;
  sort_order: number;
  display_label: string;
};

export type PublicQuickOfferDto = {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  hero_image_url: string | null;
  cta_text: string;
  timer_duration_seconds: number;
  template_key: string;
  mid_cta_after_count: number | null;
  regular_price: number;
  promo_price: number;
  practice_id: string;
  practice_slug: string;
  author_id: string;
  materials: PublicQuickOfferMaterialDto[];
};

export type QuickOfferEligibleProduct = {
  id: string;
  slug: string;
  title: string;
  price: number;
  is_free: boolean;
  status: string;
};
