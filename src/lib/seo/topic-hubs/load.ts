import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getPublishedCatalogProducts,
  type CatalogProduct,
} from "@/lib/products/catalog";
import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";
import { listActiveTopics } from "@/lib/topics/queries";

import { buildTopicHubPath } from "./paths";
import { getTopicHubBySlug } from "./registry";
import type { TopicHubDefinition, TopicHubPageData } from "./types";

function sortProductsForHub(products: CatalogProduct[]): CatalogProduct[] {
  return [...products].sort((left, right) => {
    if (left.isFree !== right.isFree) {
      return left.isFree ? -1 : 1;
    }

    if (right.sortTimestamp !== left.sortTimestamp) {
      return right.sortTimestamp - left.sortTimestamp;
    }

    return left.title.localeCompare(right.title, "ru");
  });
}

function applyAllowlistOrder(
  products: CatalogProduct[],
  allowlist: readonly string[],
): CatalogProduct[] {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const ordered: CatalogProduct[] = [];

  for (const slug of allowlist) {
    const product = bySlug.get(slug);

    if (product) {
      ordered.push(product);
    }
  }

  return ordered;
}

export function selectTopicHubProducts(
  productsRaw: CatalogProduct[],
  hub: TopicHubDefinition,
): CatalogProduct[] {
  let products = productsRaw;

  if (hub.freeOnly) {
    products = products.filter((product) => product.isFree);
  }

  const allowlist = hub.practiceSlugAllowlist;

  if (allowlist && allowlist.length > 0) {
    return applyAllowlistOrder(products, allowlist);
  }

  return sortProductsForHub(products);
}

export async function loadTopicHubPageData(
  supabase: SupabaseClient,
  slug: string,
): Promise<TopicHubPageData | null> {
  const hub = getTopicHubBySlug(slug);

  if (!hub) {
    return null;
  }

  const topicKey = hub.topicKey?.trim() || null;

  const [productsRaw, activeTopics] = await Promise.all([
    getPublishedCatalogProducts(
      supabase,
      topicKey ? { topicKey } : undefined,
    ),
    listActiveTopics(supabase).catch(() => []),
  ]);

  const products = selectTopicHubProducts(productsRaw, hub);
  const freeProducts = products.filter((product) => product.isFree);
  const paidProducts = products.filter((product) => !product.isFree);
  const platformTopic = topicKey
    ? (activeTopics.find((topic) => topic.key === topicKey) ?? null)
    : null;
  const path = buildTopicHubPath(hub.slug);

  return {
    hub,
    path,
    canonicalUrl: buildSiteCanonicalUrl(path),
    products,
    freeProducts,
    paidProducts,
    platformTopicTitle: platformTopic?.title ?? null,
  };
}
