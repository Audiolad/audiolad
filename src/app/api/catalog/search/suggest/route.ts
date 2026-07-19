import { NextResponse } from "next/server";

import { searchPublishedCatalogAuthors, CATALOG_AUTHOR_SUGGEST_LIMIT } from "@/lib/catalog/author-search";
import {
  CATALOG_SEARCH_SUGGEST_MIN_LENGTH,
  CATALOG_PRODUCT_SUGGEST_LIMIT,
  normalizeCatalogSearchQuery,
  searchPublishedCatalogProducts,
} from "@/lib/catalog/search";
import {
  mapCatalogAuthorsToSuggestions,
  mapCatalogProductsToSuggestions,
} from "@/lib/catalog/search-suggestions";
import { normalizeCatalogTopicParam } from "@/lib/catalog/topic-filter";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

const EMPTY_RESPONSE = {
  authors: [],
  products: [],
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const normalizedQuery = normalizeCatalogSearchQuery(searchParams.get("q"));

  if (normalizedQuery.length < CATALOG_SEARCH_SUGGEST_MIN_LENGTH) {
    return NextResponse.json(EMPTY_RESPONSE, { headers: NO_STORE_HEADERS });
  }

  const topicKey = normalizeCatalogTopicParam(searchParams.get("topic"));

  try {
    const supabase = await createClient();

    const [authorResults, productResults] = await Promise.all([
      searchPublishedCatalogAuthors(supabase, {
        query: normalizedQuery,
        topicKey,
        limit: CATALOG_AUTHOR_SUGGEST_LIMIT,
      }),
      searchPublishedCatalogProducts(supabase, {
        query: normalizedQuery,
        topicKey,
        limit: CATALOG_PRODUCT_SUGGEST_LIMIT,
      }),
    ]);

    return NextResponse.json(
      {
        authors: mapCatalogAuthorsToSuggestions(authorResults),
        products: mapCatalogProductsToSuggestions(productResults),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error(
      "catalog_search_suggest_error",
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json(
      { error: "search_unavailable", ...EMPTY_RESPONSE },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
