import "server-only";

import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { createClient } from "@/lib/supabase/server";

import {
  selectBusinessListenCandidates,
  type BusinessListenExample,
} from "./listen-selection";

export type { BusinessListenExample };

export async function loadBusinessListenExamples(): Promise<
  BusinessListenExample[]
> {
  try {
    const supabase = await createClient();
    const products = await getPublishedCatalogProducts(supabase, {
      productKind: "music",
    });
    const selected = selectBusinessListenCandidates(products);

    return selected.flatMap((product) => {
      if (!product.authorSlug) {
        return [];
      }

      return [
        {
          id: product.id,
          title: product.title,
          authorName: product.authorName,
          authorSlug: product.authorSlug,
          slug: product.slug,
          href: product.href,
          coverUrl: product.coverUrl,
          coverImage: product.coverImage ?? null,
          updatedAt: product.updatedAt ?? null,
          format: product.format,
        },
      ];
    });
  } catch (error) {
    console.error(
      "[business-landing] listen examples unavailable",
      error instanceof Error ? error.name : "unknown",
    );
    return [];
  }
}
