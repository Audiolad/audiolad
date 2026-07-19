import { NextResponse } from "next/server";

import {
  CATALOG_SEARCH_SUGGEST_MIN_LENGTH,
  CATALOG_SEARCH_SUGGESTION_LIMIT,
  normalizeCatalogSearchQuery,
  searchPublishedCatalogProducts,
} from "@/lib/catalog/search";
import { mapCatalogProductsToSuggestions } from "@/lib/catalog/search-suggestions";
import { normalizeCatalogTopicParam } from "@/lib/catalog/topic-filter";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const normalizedQuery = normalizeCatalogSearchQuery(searchParams.get("q"));

  if (normalizedQuery.length < CATALOG_SEARCH_SUGGEST_MIN_LENGTH) {
    return NextResponse.json(
      { suggestions: [] },
      { headers: NO_STORE_HEADERS },
    );
  }

  const topicKey = normalizeCatalogTopicParam(searchParams.get("topic"));

  try {
    const supabase = await createClient();
    const products = await searchPublishedCatalogProducts(supabase, {
      query: normalizedQuery,
      topicKey,
      limit: CATALOG_SEARCH_SUGGESTION_LIMIT,
    });

    const suggestions = mapCatalogProductsToSuggestions(products);

    return NextResponse.json({ suggestions }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error(
      "catalog_search_suggest_error",
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json(
      { error: "search_unavailable", suggestions: [] },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
