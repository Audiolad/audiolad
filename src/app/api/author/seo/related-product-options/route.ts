import { NextResponse } from "next/server";

import { requirePracticeAccess, handleAuthorRouteError } from "@/lib/author-products/auth";
import { getDisplayFormat } from "@/lib/author-products/format";
import { hasPermission } from "@/lib/auth/platform-access";
import {
  RELATED_PRODUCT_SEARCH_LIMIT,
  parseRelatedProductIdsParam,
  shouldSearchRelatedProducts,
  toRelatedProductOrFilter,
} from "@/lib/seo/related-product-search";

export const dynamic = "force-dynamic";

const MAX_RESULTS = RELATED_PRODUCT_SEARCH_LIMIT;
const MAX_QUERY_LENGTH = 120;

function readAuthorName(value: unknown): string {
  const author = Array.isArray(value) ? value[0] : value;
  return author && typeof author === "object" && "name" in author && typeof author.name === "string"
    ? author.name.trim()
    : "";
}

/** Editor search results are authorization-scoped server-side, never by client author IDs. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sourcePracticeId = url.searchParams.get("source")?.trim();
    if (!sourcePracticeId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, user, practice } = await requirePracticeAccess(sourcePracticeId);
    const isAdmin = await hasPermission(supabase, user.id, "admin_panel.access");
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    const selectedIds = parseRelatedProductIdsParam(url.searchParams.get("ids"));
    const searching = shouldSearchRelatedProducts(query);

    if (!searching && !selectedIds.length) {
      return NextResponse.json({ options: [] });
    }

    let productQuery = supabase
      .from("practices")
      .select("id, title, subtitle, format, cover_url, authors!practices_author_id_fkey(name)")
      .eq("status", "published")
      .is("deleted_at", null)
      .eq("catalog_visibility", "listed")
      .eq("is_catalog_listed", true)
      .neq("id", practice.id)
      .order("title")
      .limit(MAX_RESULTS);

    if (!isAdmin) {
      productQuery = productQuery.eq("author_id", practice.author_id);
    }
    if (searching) {
      productQuery = productQuery.or(toRelatedProductOrFilter(query));
    } else {
      productQuery = productQuery.in("id", selectedIds);
    }

    const { data, error } = await productQuery;
    if (error) {
      throw new Error("related_product_options_lookup_failed");
    }

    return NextResponse.json({
      options: (data ?? []).map((item) => {
        const authorName = readAuthorName(item.authors);
        return {
          value: item.id,
          label: isAdmin && authorName ? `${item.title} — ${authorName}` : item.title,
          authorName,
          formatLabel: getDisplayFormat(item.format),
          coverUrl: typeof item.cover_url === "string" && item.cover_url.trim()
            ? item.cover_url.trim()
            : null,
        };
      }),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
