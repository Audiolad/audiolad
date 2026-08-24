import { NextResponse } from "next/server";

import { loadCatalogPlaySession } from "@/lib/catalog/catalog-playback";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

/**
 * GET catalog Play session. Does not change GET /api/catalog.
 * Reuses the listen session loader for entitled/free full playback
 * and returns a preview contract when the listener has no access.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authorSlug = searchParams.get("author")?.trim() ?? "";
  const productSlug = searchParams.get("slug")?.trim() ?? "";

  if (!authorSlug || !productSlug) {
    return NextResponse.json(
      { ok: false, reason: "not_found" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const loaded = await loadCatalogPlaySession(
      supabase,
      authorSlug,
      productSlug,
      user?.id ?? null,
    );

    if (!loaded.ok) {
      const status =
        loaded.reason === "not_found"
          ? 404
          : loaded.reason === "error"
            ? 500
            : 403;

      return NextResponse.json(
        { ok: false, reason: loaded.reason },
        { status, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, session: loaded.session },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error(
      "catalog_play_session_error",
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json(
      { ok: false, reason: "error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
