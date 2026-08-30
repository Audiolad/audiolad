import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import { resolveAuthorRecommendationsTitle } from "@/lib/products/author-recommendations-title";
import { formatProductDuration } from "@/lib/products/duration";
import { getListenPageBySlug } from "@/lib/seo/listens/registry";

export type PracticeSeoUsageItem = { content: string };
export type PracticeSeoFaqItem = { question: string; answer: string };
export type PracticeSeoContentInput = {
  usageItems: PracticeSeoUsageItem[];
  faqItems: PracticeSeoFaqItem[];
  relatedPracticeIds: string[];
  relatedListenSlugs: string[];
};

export type PublicRelatedProduct = {
  practiceId: string;
  title: string;
  href: string;
  authorName: string | null;
  formatLabel: string | null;
  durationLabel: string | null;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
};

export type PublicPracticeSeoContent = {
  usageItems: PracticeSeoUsageItem[];
  faqItems: PracticeSeoFaqItem[];
  relatedProducts: PublicRelatedProduct[];
  relatedListens: Array<{ title: string; href: string }>;
  authorRecommendationsTitle: string;
};

/** Keep editor and public-page wording aligned for the ordered usage section. */
export function getPracticeSeoUsageHeading(productKind?: string | null): string {
  if (productKind === "music") return "Как слушать музыку";
  if (productKind === "practice") return "Как использовать практику";
  return "Как использовать";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTextItems(
  value: unknown,
  key: "content" | "question",
  secondaryKey?: "answer",
): PracticeSeoUsageItem[] | PracticeSeoFaqItem[] | null {
  if (!Array.isArray(value)) return null;
  if (
    value.length >
    (key === "content"
      ? PRODUCT_CONTENT_LIMITS.seoUsageItems
      : PRODUCT_CONTENT_LIMITS.seoFaqItems)
  ) return null;

  const items: Array<PracticeSeoUsageItem | PracticeSeoFaqItem> = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item[key] !== "string") continue;
    const primary = item[key].trim();
    // Draft placeholder rows are never persisted as public SEO content.
    if (!primary) continue;
    if (key === "content") {
      if (primary.length <= PRODUCT_CONTENT_LIMITS.seoUsageItem) {
        items.push({ content: primary });
      }
      continue;
    }
    if (!secondaryKey || typeof item[secondaryKey] !== "string") continue;
    const answer = item[secondaryKey].trim();
    if (
      answer &&
      primary.length <= PRODUCT_CONTENT_LIMITS.seoFaqQuestion &&
      answer.length <= PRODUCT_CONTENT_LIMITS.seoFaqAnswer
    ) {
      items.push({ question: primary, answer });
    }
  }
  return items as PracticeSeoUsageItem[] | PracticeSeoFaqItem[];
}

export function parsePracticeSeoContent(
  value: unknown,
): PracticeSeoContentInput | null {
  if (!isRecord(value)) return null;
  const usageItems = parseTextItems(value.usage_items, "content");
  const faqItems = parseTextItems(value.faq_items, "question", "answer");
  if (
    !usageItems ||
    !faqItems ||
    !Array.isArray(value.related_practice_ids) ||
    (value.related_listen_slugs !== undefined && !Array.isArray(value.related_listen_slugs))
  ) {
    return null;
  }

  const relatedListenSlugsRaw = Array.isArray(value.related_listen_slugs)
    ? value.related_listen_slugs
    : [];
  if (
    value.related_practice_ids.length > PRODUCT_CONTENT_LIMITS.seoUsageItems ||
    relatedListenSlugsRaw.length > PRODUCT_CONTENT_LIMITS.seoUsageItems
  ) return null;
  const relatedPracticeIds = value.related_practice_ids
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
  const relatedListenSlugs = relatedListenSlugsRaw
    .map((slug) => (typeof slug === "string" ? slug.trim().toLowerCase() : ""))
    .filter(Boolean);
  if (
    relatedPracticeIds.some((id) => !UUID_PATTERN.test(id)) ||
    relatedListenSlugs.some((slug) => !getListenPageBySlug(slug)) ||
    new Set((usageItems as PracticeSeoUsageItem[]).map((item) => item.content.toLocaleLowerCase())).size !== usageItems.length ||
    new Set((faqItems as PracticeSeoFaqItem[]).map((item) => item.question.toLocaleLowerCase())).size !== faqItems.length ||
    new Set(relatedPracticeIds).size !== relatedPracticeIds.length ||
    new Set(relatedListenSlugs).size !== relatedListenSlugs.length
  ) {
    return null;
  }

  return {
    usageItems: usageItems as PracticeSeoUsageItem[],
    faqItems: faqItems as PracticeSeoFaqItem[],
    relatedPracticeIds,
    relatedListenSlugs,
  };
}

export async function validateRelatedPracticeTargets(input: {
  supabase: SupabaseClient;
  sourcePracticeId: string;
  sourceAuthorId: string;
  relatedPracticeIds: string[];
  isAdmin: boolean;
}): Promise<"invalid_related_product" | "related_product_not_owned" | null> {
  if (input.relatedPracticeIds.includes(input.sourcePracticeId)) {
    return "invalid_related_product";
  }
  if (!input.relatedPracticeIds.length) return null;

  const { data, error } = await input.supabase
    .from("practices")
    .select("id, author_id, status, deleted_at, catalog_visibility, is_catalog_listed")
    .in("id", input.relatedPracticeIds)
    .eq("status", "published")
    .is("deleted_at", null)
    .eq("catalog_visibility", "listed")
    .eq("is_catalog_listed", true);
  if (error || (data?.length ?? 0) !== input.relatedPracticeIds.length) {
    return "invalid_related_product";
  }
  if (!input.isAdmin && data?.some((row) => row.author_id !== input.sourceAuthorId)) {
    return "related_product_not_owned";
  }
  return null;
}

/** Product SEO no longer edits related Listen; keep stored slugs on ordinary save. */
export function withPreservedRelatedListenSlugs(
  incoming: PracticeSeoContentInput,
  previous: PracticeSeoContentInput,
): PracticeSeoContentInput {
  return {
    ...incoming,
    relatedListenSlugs: previous.relatedListenSlugs,
  };
}

export async function replacePracticeSeoContent(
  supabase: SupabaseClient,
  practiceId: string,
  content: PracticeSeoContentInput,
): Promise<void> {
  const { error } = await supabase.rpc("replace_practice_seo_content", {
    p_practice_id: practiceId,
    p_usage_items: content.usageItems,
    p_faq_items: content.faqItems,
    p_related_practice_ids: content.relatedPracticeIds,
    p_related_listen_slugs: content.relatedListenSlugs,
  });
  if (error) {
    throw new Error("practice_seo_content_save_failed");
  }
}

export function hasPracticeSeoContentChanges(
  previous: PracticeSeoContentInput,
  next: PracticeSeoContentInput,
): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

export async function loadAuthorPracticeSeoContent(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeSeoContentInput> {
  const [usage, faq, relatedProducts, relatedListens] = await Promise.all([
    supabase.from("practice_seo_usage_items").select("content").eq("practice_id", practiceId).order("position"),
    supabase.from("practice_seo_faq_items").select("question, answer").eq("practice_id", practiceId).order("position"),
    supabase.from("practice_related_products").select("related_practice_id").eq("practice_id", practiceId).order("position"),
    supabase.from("practice_related_listens").select("listen_slug").eq("practice_id", practiceId).order("position"),
  ]);
  if (usage.error || faq.error || relatedProducts.error || relatedListens.error) {
    throw new Error("practice_seo_content_lookup_failed");
  }
  return {
    usageItems: (usage.data ?? []).map((row) => ({ content: String(row.content) })),
    faqItems: (faq.data ?? []).map((row) => ({ question: String(row.question), answer: String(row.answer) })),
    relatedPracticeIds: (relatedProducts.data ?? []).map((row) => String(row.related_practice_id)),
    relatedListenSlugs: (relatedListens.data ?? []).map((row) => String(row.listen_slug)),
  };
}

function readRelatedAuthor(value: unknown): { slug: string; name: string | null } | null {
  const author = Array.isArray(value) ? value[0] : value;
  if (!author || typeof author !== "object" || !("slug" in author) || typeof author.slug !== "string") {
    return null;
  }
  const slug = author.slug.trim();
  if (!slug) {
    return null;
  }
  const name =
    "name" in author && typeof author.name === "string" && author.name.trim()
      ? author.name.trim()
      : null;
  return { slug, name };
}

export function mapPublicRelatedProduct(target: {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  format?: unknown;
  duration_minutes?: unknown;
  cover_url?: unknown;
  cover_image?: unknown;
  updated_at?: unknown;
  authors?: unknown;
}): PublicRelatedProduct | null {
  const author = readRelatedAuthor(target.authors);
  const practiceId = typeof target.id === "string" ? target.id : "";
  const title = typeof target.title === "string" ? target.title.trim() : "";
  const slug = typeof target.slug === "string" ? target.slug.trim() : "";
  if (!practiceId || !title || !slug || !author) {
    return null;
  }

  return {
    practiceId,
    title,
    href: `/practice/${author.slug}/${slug}`,
    authorName: author.name,
    formatLabel: getDisplayFormat(typeof target.format === "string" ? target.format : null),
    durationLabel: formatProductDuration(
      null,
      typeof target.duration_minutes === "number" ? target.duration_minutes : null,
    ),
    coverUrl: typeof target.cover_url === "string" && target.cover_url.trim()
      ? target.cover_url.trim()
      : null,
    coverImage: target.cover_image ?? null,
    updatedAt: typeof target.updated_at === "string" ? target.updated_at : null,
  };
}

export async function loadPublicPracticeSeoContent(
  supabase: SupabaseClient,
  practiceId: string,
  storedAuthorRecommendationsTitle?: string | null,
): Promise<PublicPracticeSeoContent> {
  const [usage, faq, relatedProducts] = await Promise.all([
    supabase.from("practice_seo_usage_items").select("content").eq("practice_id", practiceId).order("position"),
    supabase.from("practice_seo_faq_items").select("question, answer").eq("practice_id", practiceId).order("position"),
    supabase.from("practice_related_products").select("related_practice_id").eq("practice_id", practiceId).order("position"),
  ]);
  const ids = (relatedProducts.data ?? []).map((row) => row.related_practice_id as string);
  const { data: targets } = ids.length
    ? await supabase
        .from("practices")
        .select("id, title, slug, format, duration_minutes, cover_url, cover_image, updated_at, authors!practices_author_id_fkey(slug, name)")
        .in("id", ids)
        .eq("status", "published")
        .is("deleted_at", null)
        .eq("catalog_visibility", "listed")
        .eq("is_catalog_listed", true)
    : { data: [] as Array<Record<string, unknown>> };
  const targetById = new Map((targets ?? []).map((target) => [target.id as string, target]));

  return {
    usageItems: usage.error ? [] : (usage.data ?? []).map((row) => ({ content: String(row.content) })),
    faqItems: faq.error ? [] : (faq.data ?? []).map((row) => ({ question: String(row.question), answer: String(row.answer) })),
    relatedProducts: relatedProducts.error ? [] : ids.flatMap((id) => {
      const mapped = mapPublicRelatedProduct(targetById.get(id) ?? {});
      return mapped ? [mapped] : [];
    }),
    relatedListens: [],
    authorRecommendationsTitle: resolveAuthorRecommendationsTitle(
      storedAuthorRecommendationsTitle,
    ),
  };
}
