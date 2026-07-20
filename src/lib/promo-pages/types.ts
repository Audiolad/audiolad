export const PROMO_PAGE_STATUSES = ["draft", "published", "unpublished"] as const;

export type PromoPageStatus = (typeof PROMO_PAGE_STATUSES)[number];

export type PromoPageRecord = {
  id: string;
  author_id: string;
  internal_name: string;
  slug: string;
  status: PromoPageStatus;
  public_title: string;
  public_description: string | null;
  banner_path: string | null;
  footer_text: string | null;
  cta_enabled: boolean;
  cta_heading: string | null;
  cta_description: string | null;
  cta_label: string | null;
  cta_href: string | null;
  cta_open_in_new_tab: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PromoPageProductRecord = {
  promo_page_id: string;
  practice_id: string;
  position: number;
  created_at: string;
};

export type PromoPageAdminProduct = {
  practice_id: string;
  slug: string;
  title: string;
  format: string | null;
  duration_minutes: number | null;
  status: string;
  position: number;
};

export type PromoPageAdminDto = {
  id: string;
  author_id: string;
  internal_name: string;
  slug: string;
  status: PromoPageStatus;
  public_title: string;
  public_description: string | null;
  banner_path: string | null;
  footer_text: string | null;
  cta_enabled: boolean;
  cta_heading: string | null;
  cta_description: string | null;
  cta_label: string | null;
  cta_href: string | null;
  cta_open_in_new_tab: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  products: PromoPageAdminProduct[];
};

export type PublicPromoPageProductDto = {
  practice_id: string;
  slug: string;
  title: string;
  format: string | null;
  duration_minutes: number | null;
  cover_url: string | null;
  cover_image: unknown;
  author_name: string;
  author_slug: string;
  position: number;
};

export type PublicPromoPageDto = {
  promo_page_id: string;
  author_slug: string;
  slug: string;
  public_title: string;
  public_description: string | null;
  banner_path: string | null;
  footer_text: string | null;
  cta_enabled: boolean;
  cta_heading: string | null;
  cta_description: string | null;
  cta_label: string | null;
  cta_href: string | null;
  cta_open_in_new_tab: boolean;
  published_at: string | null;
  products: PublicPromoPageProductDto[];
};

export type PublicPromoPageCtaBlock = {
  heading: string | null;
  description: string | null;
  label: string;
  href: string;
  kind: "internal" | "external";
  host: string | null;
  openInNewTab: boolean;
};

export const PUBLIC_PROMO_PAGE_FORBIDDEN_FIELDS = [
  "internal_name",
  "created_by",
  "author_id",
  "status",
  "created_at",
  "updated_at",
] as const;
