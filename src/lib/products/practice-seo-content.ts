import type { SupabaseClient } from "@supabase/supabase-js";

import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import { getListenPageBySlug } from "@/lib/seo/listens/registry";

export type PracticeSeoUsageItem = { content: string };
export type PracticeSeoFaqItem = { question: string; answer: string };
export type PracticeSeoContentInput = {
  usageItems: PracticeSeoUsageItem[];
  faqItems: PracticeSeoFaqItem[];
  relatedPracticeIds: string[];
  relatedListenSlugs: string[];
};

export type PublicPracticeSeoContent = {
  usageItems: PracticeSeoUsageItem[];
  faqItems: PracticeSeoFaqItem[];
  relatedProducts: Array<{ title: string; href: string }>;
  relatedListens: Array<{ title: string; href: string }>;
};

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

  const items = value.map((item) => {
    if (!isRecord(item) || typeof item[key] !== "string") return null;
    const primary = item[key].trim();
    if (!primary) return null;
    if (key === "content") {
      return primary.length <= PRODUCT_CONTENT_LIMITS.seoUsageItem
        ? { content: primary }
        : null;
    }
    if (!secondaryKey || typeof item[secondaryKey] !== "string") return null;
    const answer = item[secondaryKey].trim();
    return answer &&
      primary.length <= PRODUCT_CONTENT_LIMITS.seoFaqQuestion &&
      answer.length <= PRODUCT_CONTENT_LIMITS.seoFaqAnswer
      ? { question: primary, answer }
      : null;
  });
  return items.every(Boolean) ? (items as PracticeSeoUsageItem[] | PracticeSeoFaqItem[]) : null;
}

export function parsePracticeSeoContent(
  value: unknown,
): PracticeSeoContentInput | null {
  if (!isRecord(value)) return null;
  const usageItems = parseTextItems(value.usage_items, "content");
  const faqItems = parseTextItems(value.faq_items, "question", "answer");
  if (!usageItems || !faqItems || !Array.isArray(value.related_practice_ids) || !Array.isArray(value.related_listen_slugs)) {
    return null;
  }

  const relatedPracticeIds = value.related_practice_ids.map((id) =>
    typeof id === "string" ? id.trim() : "",
  );
  const relatedListenSlugs = value.related_listen_slugs.map((slug) =>
    typeof slug === "string" ? slug.trim().toLowerCase() : "",
  );
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
    .select("id, author_id, status, deleted_at, catalog_visibility")
    .in("id", input.relatedPracticeIds)
    .eq("status", "published")
    .is("deleted_at", null)
    .eq("catalog_visibility", "listed");
  if (error || (data?.length ?? 0) !== input.relatedPracticeIds.length) {
    return "invalid_related_product";
  }
  if (!input.isAdmin && data?.some((row) => row.author_id !== input.sourceAuthorId)) {
    return "related_product_not_owned";
  }
  return null;
}

export async function replacePracticeSeoContent(
  supabase: SupabaseClient,
  practiceId: string,
  content: PracticeSeoContentInput,
): Promise<void> {
  const tables = [
    "practice_seo_usage_items",
    "practice_seo_faq_items",
    "practice_related_products",
    "practice_related_listens",
  ];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("practice_id", practiceId);
    if (error) throw new Error("practice_seo_content_save_failed");
  }

  const writes = [
    content.usageItems.length
      ? supabase.from("practice_seo_usage_items").insert(
          content.usageItems.map((item, position) => ({ practice_id: practiceId, ...item, position })),
        )
      : null,
    content.faqItems.length
      ? supabase.from("practice_seo_faq_items").insert(
          content.faqItems.map((item, position) => ({ practice_id: practiceId, ...item, position })),
        )
      : null,
    content.relatedPracticeIds.length
      ? supabase.from("practice_related_products").insert(
          content.relatedPracticeIds.map((related_practice_id, position) => ({ practice_id: practiceId, related_practice_id, position })),
        )
      : null,
    content.relatedListenSlugs.length
      ? supabase.from("practice_related_listens").insert(
          content.relatedListenSlugs.map((listen_slug, position) => ({ practice_id: practiceId, listen_slug, position })),
        )
      : null,
  ].filter(Boolean);
  const results = await Promise.all(writes);
  if (results.some((result) => result?.error)) {
    throw new Error("practice_seo_content_save_failed");
  }
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

export async function loadPublicPracticeSeoContent(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PublicPracticeSeoContent> {
  const [usage, faq, relatedProducts, relatedListens] = await Promise.all([
    supabase.from("practice_seo_usage_items").select("content").eq("practice_id", practiceId).order("position"),
    supabase.from("practice_seo_faq_items").select("question, answer").eq("practice_id", practiceId).order("position"),
    supabase.from("practice_related_products").select("related_practice_id").eq("practice_id", practiceId).order("position"),
    supabase.from("practice_related_listens").select("listen_slug").eq("practice_id", practiceId).order("position"),
  ]);
  const ids = (relatedProducts.data ?? []).map((row) => row.related_practice_id as string);
  const { data: targets } = ids.length
    ? await supabase.from("practices").select("id, title, slug, authors!practices_author_id_fkey(slug)").in("id", ids).eq("status", "published").is("deleted_at", null).eq("catalog_visibility", "listed")
    : { data: [] as Array<Record<string, unknown>> };
  const targetById = new Map((targets ?? []).map((target) => [target.id as string, target]));

  return {
    usageItems: usage.error ? [] : (usage.data ?? []).map((row) => ({ content: String(row.content) })),
    faqItems: faq.error ? [] : (faq.data ?? []).map((row) => ({ question: String(row.question), answer: String(row.answer) })),
    relatedProducts: relatedProducts.error ? [] : ids.flatMap((id) => {
      const target = targetById.get(id);
      const author = Array.isArray(target?.authors) ? target.authors[0] : target?.authors;
      return target?.title && target?.slug && author && typeof author === "object" && "slug" in author && typeof author.slug === "string"
        ? [{ title: String(target.title), href: `/practice/${author.slug}/${target.slug}` }]
        : [];
    }),
    relatedListens: relatedListens.error ? [] : (relatedListens.data ?? []).flatMap((row) => {
      const listen = getListenPageBySlug(String(row.listen_slug));
      return listen ? [{ title: listen.title, href: `/listens/${listen.slug}` }] : [];
    }),
  };
}
