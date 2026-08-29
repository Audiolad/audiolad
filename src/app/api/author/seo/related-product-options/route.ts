import { NextResponse } from "next/server";

import { requirePracticeAccess, handleAuthorRouteError } from "@/lib/author-products/auth";
import { hasPermission } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

const MAX_RESULTS = 25;
const MAX_QUERY_LENGTH = 120;

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

    let productQuery = supabase
      .from("practices")
      .select("id, title, authors!practices_author_id_fkey(name)")
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
    if (query) {
      productQuery = productQuery.ilike("title", `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    }

    const { data, error } = await productQuery;
    if (error) {
      throw new Error("related_product_options_lookup_failed");
    }

    return NextResponse.json({
      options: (data ?? []).map((item) => {
        const author = Array.isArray(item.authors) ? item.authors[0] : item.authors;
        const authorName =
          author && typeof author === "object" && "name" in author && typeof author.name === "string"
            ? author.name
            : "";
        return {
          value: item.id,
          label: isAdmin && authorName ? `${item.title} — ${authorName}` : item.title,
        };
      }),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
