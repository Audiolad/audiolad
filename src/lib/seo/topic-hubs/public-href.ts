import { buildCatalogTopicHref } from "@/lib/catalog/topic-filter";

import { buildTopicHubPath } from "./paths";
import { getTopicHubByTopicKey } from "./registry";

/**
 * Prefer SEO hub URL when an editorial hub exists for the platform topic key.
 * Fallback: catalog filter `/catalog?topic=<key>`.
 */
export function resolveTopicPublicHref(topicKey: string): string {
  const hub = getTopicHubByTopicKey(topicKey);

  if (hub) {
    return buildTopicHubPath(hub.slug);
  }

  return buildCatalogTopicHref(topicKey);
}
