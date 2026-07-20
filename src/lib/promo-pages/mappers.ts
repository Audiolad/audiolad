import { getDisplayFormat } from "@/lib/author-products/format";
import type {
  PromoPageAdminDto,
  PromoPageAdminProduct,
  PromoPageRecord,
  PromoPageStatus,
} from "@/lib/promo-pages/types";

type PromoPageRow = Record<string, unknown>;

function normalizeStatus(value: unknown): PromoPageStatus {
  if (value === "published" || value === "unpublished" || value === "draft") {
    return value;
  }

  return "draft";
}

function mapProductRow(
  row: Record<string, unknown>,
): PromoPageAdminProduct | null {
  const practice = Array.isArray(row.practices)
    ? row.practices[0]
    : row.practices;

  if (!practice || typeof practice !== "object") {
    return null;
  }

  const practiceRecord = practice as Record<string, unknown>;

  return {
    practice_id: String(practiceRecord.id ?? row.practice_id ?? ""),
    slug: String(practiceRecord.slug ?? ""),
    title: String(practiceRecord.title ?? ""),
    format: getDisplayFormat(
      typeof practiceRecord.format === "string" ? practiceRecord.format : null,
    ),
    duration_minutes:
      typeof practiceRecord.duration_minutes === "number"
        ? practiceRecord.duration_minutes
        : null,
    status: String(practiceRecord.status ?? ""),
    position: Number(row.position ?? 0),
  };
}

export function mapPromoPageAdminDto(row: PromoPageRow): PromoPageAdminDto {
  const productsRaw = Array.isArray(row.promo_page_products)
    ? row.promo_page_products
    : [];

  const products = productsRaw
    .map((item) => mapProductRow(item as Record<string, unknown>))
    .filter((item): item is PromoPageAdminProduct => item !== null)
    .sort((left, right) => left.position - right.position);

  return {
    id: String(row.id),
    author_id: String(row.author_id),
    internal_name: String(row.internal_name),
    slug: String(row.slug),
    status: normalizeStatus(row.status),
    public_title: String(row.public_title),
    public_description:
      typeof row.public_description === "string" ? row.public_description : null,
    banner_path: typeof row.banner_path === "string" ? row.banner_path : null,
    footer_text: typeof row.footer_text === "string" ? row.footer_text : null,
    cta_label: typeof row.cta_label === "string" ? row.cta_label : null,
    cta_href: typeof row.cta_href === "string" ? row.cta_href : null,
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    products,
  };
}

export function mapPromoPageListItem(row: PromoPageRow): PromoPageRecord & {
  product_count: number;
  author_slug: string;
} {
  const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;
  const productsRaw = Array.isArray(row.promo_page_products)
    ? row.promo_page_products
    : [];

  return {
    id: String(row.id),
    author_id: String(row.author_id),
    internal_name: String(row.internal_name),
    slug: String(row.slug),
    status: normalizeStatus(row.status),
    public_title: String(row.public_title),
    public_description:
      typeof row.public_description === "string" ? row.public_description : null,
    banner_path: typeof row.banner_path === "string" ? row.banner_path : null,
    footer_text: typeof row.footer_text === "string" ? row.footer_text : null,
    cta_label: typeof row.cta_label === "string" ? row.cta_label : null,
    cta_href: typeof row.cta_href === "string" ? row.cta_href : null,
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    created_by:
      typeof row.created_by === "string" ? row.created_by : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    product_count: productsRaw.length,
    author_slug: String(
      author && typeof author === "object" && "slug" in author
        ? author.slug
        : "",
    ),
  };
}

export function getAuthorSlugFromPromoPageRow(row: PromoPageRow): string {
  const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;

  if (author && typeof author === "object" && "slug" in author) {
    return String(author.slug ?? "");
  }

  return "";
}
