import { NextResponse } from "next/server";

import {
  listPublishedCatalog,
  parseCatalogListingQuery,
} from "@/lib/catalog/listing";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = parseCatalogListingQuery({
    q: searchParams.get("q"),
    topic: searchParams.get("topic"),
    access: searchParams.get("access"),
    kind: searchParams.get("kind"),
    sort: searchParams.get("sort"),
    cursor: searchParams.get("cursor"),
    limit: searchParams.get("limit"),
  });

  try {
    const supabase = await createClient();
    const result = await listPublishedCatalog(supabase, query);

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error(
      "catalog_listing_error",
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json(
      { error: "catalog_unavailable", items: [], nextCursor: null },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
