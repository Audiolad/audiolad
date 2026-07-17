import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import { getProductPriceLabel, isProductFree } from "@/lib/products/price-format";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { formatCatalogProductStats, formatProductMeta } from "@/lib/products/duration";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioSummaries,
} from "@/lib/products/public-audio-items";

type CatalogPracticeRow = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
  authors: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

export type CatalogProduct = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  price: number | null;
  isFree: boolean;
  coverUrl: string | null;
  authorName: string | null;
  authorSlug: string | null;
  href: string;
  meta: string | null;
  statsLabel: string | null;
  productTypeLabel: string;
  priceLabel: string;
  sortTimestamp: number;
};

export type CatalogSections = {
  freeProducts: CatalogProduct[];
  paidProducts: CatalogProduct[];
};

export type CatalogQueryOptions = {
  topicKey?: string | null;
};

async function getPublishedPracticeIdsForTopicKey(
  supabase: SupabaseClient,
  topicKey: string,
): Promise<string[]> {
  const normalizedKey = topicKey.trim().toLowerCase();

  if (!normalizedKey) {
    return [];
  }

  const { data: topicRow, error: topicError } = await supabase
    .from("topics")
    .select("id")
    .eq("is_active", true)
    .eq("key", normalizedKey)
    .maybeSingle();

  if (topicError || !topicRow?.id) {
    return [];
  }

  const { data: practiceRows, error: practicesError } = await supabase
    .from("practices")
    .select("id")
    .eq("status", "published")
    .eq("is_catalog_listed", true);

  if (practicesError) {
    return [];
  }

  const publishedPracticeIds = new Set(
    (practiceRows ?? []).map((row) => row.id as string),
  );

  if (publishedPracticeIds.size === 0) {
    return [];
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("practice_topics")
    .select("practice_id")
    .eq("topic_id", topicRow.id)
    .in("practice_id", [...publishedPracticeIds]);

  if (assignmentError) {
    return [];
  }

  return (assignmentRows ?? []).map((row) => row.practice_id as string);
}

function normalizeAuthor(
  authors: CatalogPracticeRow["authors"],
): { name: string; slug: string } | null {
  const author = Array.isArray(authors) ? authors[0] : authors;

  if (!author?.slug?.trim() || !author?.name?.trim()) {
    return null;
  }

  return {
    name: author.name.trim(),
    slug: author.slug.trim(),
  };
}

function getProductTypeLabel(
  audioCount: number,
  format: string | null,
): string {
  const trimmedFormat = typeof format === "string" ? format.trim() : "";

  if (
    audioCount >= 2 ||
    trimmedFormat === "Программа аудиопрактик" ||
    trimmedFormat === "Аудиокурс" ||
    trimmedFormat === "Цикл практик"
  ) {
    return "Программа аудиопрактик";
  }

  return "Аудиопрактика";
}

function getSortTimestamp(
  publishedAt: string | null,
  createdAt: string | null,
): number {
  const publishedTime = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  const createdTime = createdAt ? Date.parse(createdAt) : Number.NaN;

  if (Number.isFinite(publishedTime)) {
    return publishedTime;
  }

  if (Number.isFinite(createdTime)) {
    return createdTime;
  }

  return 0;
}

export async function getPublishedCatalogProducts(
  supabase: SupabaseClient,
  options?: CatalogQueryOptions,
): Promise<CatalogProduct[]> {
  const topicKey = options?.topicKey?.trim().toLowerCase() || null;
  let practiceIdsForTopic: string[] | null = null;

  if (topicKey) {
    practiceIdsForTopic = await getPublishedPracticeIdsForTopicKey(
      supabase,
      topicKey,
    );

    if (practiceIdsForTopic.length === 0) {
      return [];
    }
  }

  let query = supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      subtitle,
      description,
      format,
      duration_minutes,
      price,
      is_free,
      cover_url,
      updated_at,
      published_at,
      created_at,
      authors!inner (
        name,
        slug
      )
    `,
    )
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .not("slug", "is", null)
    .not("author_id", "is", null);

  if (practiceIdsForTopic) {
    query = query.in("id", practiceIdsForTopic);
  }

  const { data: practices, error } = await query;

  if (error) {
    return [];
  }

  const practiceRows = (practices ?? []) as CatalogPracticeRow[];

  if (practiceRows.length === 0) {
    return [];
  }

  let audioSummaryMap = new Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >();

  try {
    const summaries = await loadPublishedAudioSummaries(
      supabase,
      practiceRows.map((practice) => practice.id),
    );
    audioSummaryMap = groupAudioSummariesByPractice(summaries);
  } catch {
    audioSummaryMap = new Map();
  }

  const products = practiceRows.flatMap((practice) => {
    const author = normalizeAuthor(practice.authors);

    if (!author) {
      return [];
    }

    const audioSummary = audioSummaryMap.get(practice.id);
    const audioCount = audioSummary?.audioCount ?? 0;

    return [
      {
        id: practice.id,
        title: practice.title,
        slug: practice.slug,
        subtitle: practice.subtitle?.trim() || null,
        description: practice.description?.trim() || null,
        format: practice.format?.trim() || null,
        price: practice.price,
        isFree: isProductFree(practice.is_free, practice.price),
        coverUrl: getProductCoverDisplayUrl(
          practice.cover_url,
          practice.updated_at,
        ),
        authorName: author.name,
        authorSlug: author.slug,
        href: buildPracticePublicPath(author.slug, practice.slug),
        meta: formatProductMeta({
          format: practice.format,
          audioCount,
          totalDurationSeconds: audioSummary?.totalDurationSeconds ?? 0,
          durationMinutesFallback: practice.duration_minutes,
        }),
        statsLabel: formatCatalogProductStats({
          audioCount,
          totalDurationSeconds: audioSummary?.totalDurationSeconds ?? 0,
          durationMinutesFallback: practice.duration_minutes,
        }),
        productTypeLabel:
          getDisplayFormat(practice.format) ??
          getProductTypeLabel(audioCount, practice.format),
        priceLabel: getProductPriceLabel(practice.price, practice.is_free),
        sortTimestamp: getSortTimestamp(
          practice.published_at,
          practice.created_at,
        ),
      },
    ];
  });

  return products.sort((left, right) => right.sortTimestamp - left.sortTimestamp);
}

export function splitCatalogProducts(products: CatalogProduct[]): CatalogSections {
  const freeProducts: CatalogProduct[] = [];
  const paidProducts: CatalogProduct[] = [];

  for (const product of products) {
    if (product.isFree) {
      freeProducts.push(product);
    } else if (typeof product.price === "number" && product.price > 0) {
      paidProducts.push(product);
    }
  }

  return { freeProducts, paidProducts };
}

export async function getPublishedCatalogSections(
  supabase: SupabaseClient,
  options?: CatalogQueryOptions,
): Promise<CatalogSections> {
  const products = await getPublishedCatalogProducts(supabase, options);
  return splitCatalogProducts(products);
}
