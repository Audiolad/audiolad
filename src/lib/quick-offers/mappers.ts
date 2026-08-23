import { getAuthorAssetPublicUrl } from "@/lib/authors/assets";
import { formatMaterialCaption } from "@/lib/quick-offers/format-labels";
import { buildQuickOfferPath } from "@/lib/quick-offers/paths";
import type {
  PublicQuickOfferDto,
  PublicQuickOfferMaterialDto,
  QuickOfferAdminDto,
  QuickOfferListItem,
  QuickOfferMaterialRecord,
  QuickOfferProductSnapshot,
  QuickOfferStatus,
} from "@/lib/quick-offers/types";
import { QUICK_OFFER_TEMPLATE_KEY } from "@/lib/quick-offers/types";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveAssetUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return getAuthorAssetPublicUrl(path);
}

function nestRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object"
      ? (first as JsonRecord)
      : null;
  }

  return value as JsonRecord;
}

export function mapProductSnapshot(
  row: JsonRecord | null,
): QuickOfferProductSnapshot | null {
  if (!row) {
    return null;
  }

  const practiceId = asString(row.id || row.practice_id);

  if (!practiceId) {
    return null;
  }

  return {
    practice_id: practiceId,
    slug: asString(row.slug),
    title: asString(row.title),
    status: asString(row.status),
    is_free: row.is_free === true,
    price: asNumber(row.price),
    author_id: asString(row.author_id),
  };
}

export function mapMaterialRecord(row: JsonRecord): QuickOfferMaterialRecord {
  const imagePath = asNullableString(row.image_path);

  return {
    id: asString(row.id),
    offer_id: asString(row.offer_id),
    image_path: imagePath,
    image_url: resolveAssetUrl(imagePath),
    format_label: asString(row.format_label),
    sort_order: asNumber(row.sort_order),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

export function mapQuickOfferAdminDto(row: JsonRecord): QuickOfferAdminDto {
  const practice = nestRecord(row.practices) ?? nestRecord(row.product);
  const materialsRaw = Array.isArray(row.quick_offer_materials)
    ? row.quick_offer_materials
    : Array.isArray(row.materials)
      ? row.materials
      : [];
  const slug = asString(row.slug);
  const heroPath = asNullableString(row.hero_image_path);

  return {
    id: asString(row.id),
    author_id: asString(row.author_id),
    practice_id: asString(row.practice_id),
    title: asString(row.title),
    slug,
    hero_image_path: heroPath,
    hero_image_url: resolveAssetUrl(heroPath),
    short_description: asString(row.short_description),
    promo_price: asNumber(row.promo_price),
    cta_text: asString(row.cta_text),
    timer_duration_seconds: asNumber(row.timer_duration_seconds),
    status: asString(row.status) as QuickOfferStatus,
    template_key: asString(row.template_key) || QUICK_OFFER_TEMPLATE_KEY,
    mid_cta_after_count:
      typeof row.mid_cta_after_count === "number"
        ? row.mid_cta_after_count
        : null,
    published_at: asNullableString(row.published_at),
    created_by: asNullableString(row.created_by),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    product: mapProductSnapshot(practice),
    materials: materialsRaw
      .map((item) => mapMaterialRecord(item as JsonRecord))
      .sort((left, right) => left.sort_order - right.sort_order),
    public_path: buildQuickOfferPath(slug),
  };
}

export function mapQuickOfferListItem(row: JsonRecord): QuickOfferListItem {
  const practice = nestRecord(row.practices);
  const materials = Array.isArray(row.quick_offer_materials)
    ? row.quick_offer_materials
    : [];
  const slug = asString(row.slug);

  return {
    id: asString(row.id),
    author_id: asString(row.author_id),
    practice_id: asString(row.practice_id),
    title: asString(row.title),
    slug,
    promo_price: asNumber(row.promo_price),
    status: asString(row.status) as QuickOfferStatus,
    template_key: asString(row.template_key) || QUICK_OFFER_TEMPLATE_KEY,
    published_at: asNullableString(row.published_at),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    material_count: materials.length,
    product_title: practice ? asString(practice.title) || null : null,
    product_price: practice ? asNumber(practice.price, NaN) : null,
    public_path: buildQuickOfferPath(slug),
  };
}

export function mapPublicMaterial(
  material: QuickOfferMaterialRecord,
): PublicQuickOfferMaterialDto {
  return {
    id: material.id,
    image_url: material.image_url,
    format_label: material.format_label,
    sort_order: material.sort_order,
    display_label: formatMaterialCaption(
      material.sort_order,
      material.format_label,
    ),
  };
}

export function mapPublicQuickOfferDto(
  admin: QuickOfferAdminDto,
): PublicQuickOfferDto | null {
  if (!admin.product) {
    return null;
  }

  return {
    id: admin.id,
    slug: admin.slug,
    title: admin.title,
    short_description: admin.short_description,
    hero_image_url: admin.hero_image_url,
    cta_text: admin.cta_text,
    timer_duration_seconds: admin.timer_duration_seconds,
    template_key: admin.template_key,
    mid_cta_after_count: admin.mid_cta_after_count,
    regular_price: admin.product.price,
    promo_price: admin.promo_price,
    practice_id: admin.product.practice_id,
    practice_slug: admin.product.slug,
    author_id: admin.author_id,
    materials: admin.materials.map(mapPublicMaterial),
  };
}
