import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import {
  NEXT_STEP_PRODUCT_OPTIONS_LIMIT,
  NEXT_STEP_PRODUCT_VISIBILITIES,
  mapNextStepProductRows,
  normalizeNextStepProductQuery,
} from "@/lib/products/next-step-product-options";
import { applyPracticePublicAvailabilityFilter } from "@/lib/products/scheduled-publication";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «Следующий шаг» picker options: the signed-in user's own published products
 * across every author workspace (pseudonym) they own or edit. Author scope is
 * derived server-side from memberships, never from client-supplied IDs.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const excludeRaw = url.searchParams.get("exclude")?.trim() ?? "";
    const excludeProductId = UUID_PATTERN.test(excludeRaw) ? excludeRaw : null;
    const query = normalizeNextStepProductQuery(url.searchParams.get("q"));

    const { supabase, user } = await requireAuthenticatedUser();
    const workspaces = await listAuthorWorkspacesForUser(user.id, supabase);
    const authorIds = workspaces.map((workspace) => workspace.id);

    if (!authorIds.length) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    let productQuery = applyPracticePublicAvailabilityFilter(
      supabase
        .from("practices")
        .select(
          "id, title, slug, format, product_kind, publication_class, status, deleted_at, catalog_visibility, author_id, cover_url, cover_image, updated_at, published_at, authors!practices_author_id_fkey(name, slug)",
        )
        .in("author_id", authorIds)
        .eq("status", "published")
        .is("deleted_at", null)
        .in("catalog_visibility", [...NEXT_STEP_PRODUCT_VISIBILITIES]),
    );

    if (excludeProductId) {
      productQuery = productQuery.neq("id", excludeProductId);
    }
    if (query) {
      productQuery = productQuery.ilike("title", `%${query}%`);
    }

    const { data, error } = await productQuery
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(NEXT_STEP_PRODUCT_OPTIONS_LIMIT);

    if (error) {
      console.error("next_step_product_options_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const options = mapNextStepProductRows(data ?? [], {
      allowedAuthorIds: authorIds,
      excludeProductId,
      resolveCoverUrl: (row) => {
        const record = row as {
          cover_url?: string | null;
          cover_image?: unknown;
          updated_at?: string | null;
        };
        return getProductCoverDisplayUrl(
          record.cover_url,
          record.updated_at,
          record.cover_image,
          96,
        );
      },
    });

    return NextResponse.json({ options });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
