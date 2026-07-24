import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";
import { listActiveTopics } from "@/lib/topics/queries";

import { buildTopicHubPath } from "./paths";
import { getTopicHubBySlug } from "./registry";
import type { TopicHubPageData } from "./types";

function sortProductsForHub<T extends { isFree: boolean; sortTimestamp: number; title: string }>(
  products: T[],
): T[] {
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

export async function loadTopicHubPageData(
  supabase: SupabaseClient,
  slug: string,
): Promise<TopicHubPageData | null> {
  const hub = getTopicHubBySlug(slug);

  if (!hub) {
    return null;
  }

  const [productsRaw, activeTopics] = await Promise.all([
    getPublishedCatalogProducts(supabase, { topicKey: hub.topicKey }),
    listActiveTopics(supabase).catch(() => []),
  ]);

  const products = sortProductsForHub(productsRaw);
  const freeProducts = products.filter((product) => product.isFree);
  const paidProducts = products.filter((product) => !product.isFree);
  const platformTopic =
    activeTopics.find((topic) => topic.key === hub.topicKey) ?? null;
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
