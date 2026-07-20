import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import { resolveAuthorAssetPublicUrl } from "@/lib/images/image-url";
import type {
  PublicPromoPageCtaBlock,
  PublicPromoPageDto,
  PublicPromoPageProductDto,
} from "@/lib/promo-pages/types";
import { resolvePublicPromoPageCta } from "@/lib/promo-pages/validation";

export type LoadPublicPromoPageResult =
  | { ok: true; page: PublicPromoPageDto; bannerUrl: string | null }
  | { ok: false; reason: "not_found" | "error" };

function mapPublicPromoPageProduct(
  raw: unknown,
): PublicPromoPageProductDto | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const practiceId = String(row.practice_id ?? "").trim();
  const slug = String(row.slug ?? "").trim();

  if (!practiceId || !slug) {
    return null;
  }

  const title = String(row.title ?? "").trim();

  if (!title) {
    return null;
  }

  return {
    practice_id: practiceId,
    slug,
    title,
    format: getDisplayFormat(
      typeof row.format === "string" ? row.format : null,
    ),
    duration_minutes:
      typeof row.duration_minutes === "number" ? row.duration_minutes : null,
    cover_url: typeof row.cover_url === "string" ? row.cover_url : null,
    cover_image: row.cover_image ?? null,
    author_name: String(row.author_name ?? "").trim() || "Автор",
    author_slug: String(row.author_slug ?? "").trim(),
    position:
      typeof row.position === "number"
        ? row.position
        : Number(row.position ?? 0),
  };
}

export function mapPublicPromoPageCtaBlock(
  page: Pick<
    PublicPromoPageDto,
    | "cta_enabled"
    | "cta_heading"
    | "cta_description"
    | "cta_label"
    | "cta_href"
    | "cta_open_in_new_tab"
  > & {
    promo_page_id?: string;
    id?: string;
  },
): PublicPromoPageCtaBlock | null {
  const resolved = resolvePublicPromoPageCta({
    cta_enabled: page.cta_enabled,
    cta_heading: page.cta_heading,
    cta_description: page.cta_description,
    cta_label: page.cta_label,
    cta_href: page.cta_href,
    cta_open_in_new_tab: page.cta_open_in_new_tab,
  });

  if (!resolved) {
    if (page.cta_enabled) {
      console.warn("promo_page_cta_invalid_hidden", {
        promo_page_id: page.promo_page_id ?? page.id ?? null,
      });
    }

    return null;
  }

  return {
    heading: resolved.heading,
    description: resolved.description,
    label: resolved.label,
    href: resolved.target.href,
    kind: resolved.target.kind,
    host: resolved.target.kind === "external" ? resolved.target.host : null,
    openInNewTab: resolved.openInNewTab,
  };
}

export function mapPublicPromoPageDto(
  raw: unknown,
  expectedAuthorSlug: string,
  expectedPromoSlug: string,
): PublicPromoPageDto | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const authorSlug = String(row.author_slug ?? "").trim();
  const slug = String(row.slug ?? "").trim();

  if (
    authorSlug !== expectedAuthorSlug.trim() ||
    slug !== expectedPromoSlug.trim()
  ) {
    return null;
  }

  const productsRaw = Array.isArray(row.products) ? row.products : [];
  const products = productsRaw
    .map(mapPublicPromoPageProduct)
    .filter((product): product is PublicPromoPageProductDto => product !== null)
    .sort((left, right) => left.position - right.position);

  if (products.length < 1) {
    return null;
  }

  const publicTitle = String(row.public_title ?? "").trim();

  if (!publicTitle) {
    return null;
  }

  return {
    promo_page_id: String(row.promo_page_id ?? ""),
    author_slug: authorSlug,
    slug,
    public_title: publicTitle,
    public_description:
      typeof row.public_description === "string"
        ? row.public_description
        : null,
    banner_path: typeof row.banner_path === "string" ? row.banner_path : null,
    footer_text:
      typeof row.footer_text === "string" ? row.footer_text : null,
    cta_enabled: row.cta_enabled === true,
    cta_heading:
      typeof row.cta_heading === "string" ? row.cta_heading : null,
    cta_description:
      typeof row.cta_description === "string" ? row.cta_description : null,
    cta_label:
      typeof row.cta_label === "string" && row.cta_label.trim()
        ? row.cta_label.trim()
        : null,
    cta_href:
      typeof row.cta_href === "string" && row.cta_href.trim()
        ? row.cta_href.trim()
        : null,
    cta_open_in_new_tab: row.cta_open_in_new_tab === true,
    published_at:
      typeof row.published_at === "string" ? row.published_at : null,
    products,
  };
}

export function resolvePublicPromoBannerUrl(
  bannerPath: string | null | undefined,
): string | null {
  const trimmed = bannerPath?.trim();

  if (!trimmed) {
    return null;
  }

  return resolveAuthorAssetPublicUrl(trimmed);
}

export async function loadPublicPromoPage(
  supabase: SupabaseClient,
  authorSlug: string,
  promoSlug: string,
): Promise<LoadPublicPromoPageResult> {
  const normalizedAuthorSlug = authorSlug.trim();
  const normalizedPromoSlug = promoSlug.trim();

  if (!normalizedAuthorSlug || !normalizedPromoSlug) {
    return { ok: false, reason: "not_found" };
  }

  const { data, error } = await supabase.rpc("get_public_promo_page", {
    p_author_slug: normalizedAuthorSlug,
    p_promo_slug: normalizedPromoSlug,
  });

  if (error) {
    console.error("get_public_promo_page_error", error.message);
    return { ok: false, reason: "error" };
  }

  if (data == null) {
    return { ok: false, reason: "not_found" };
  }

  const page = mapPublicPromoPageDto(
    data,
    normalizedAuthorSlug,
    normalizedPromoSlug,
  );

  if (!page) {
    return { ok: false, reason: "not_found" };
  }

  return {
    ok: true,
    page,
    bannerUrl: resolvePublicPromoBannerUrl(page.banner_path),
  };
}

export const loadPublicPromoPageCached = cache(loadPublicPromoPage);
