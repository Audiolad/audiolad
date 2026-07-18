import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { normalizeBannerPositionPair } from "@/lib/authors/banner-position";
import { getAuthorProfileDetail } from "@/lib/authors/profile";

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authorId =
      typeof body.author_id === "string" ? body.author_id.trim() : "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const position = normalizeBannerPositionPair(
      body.banner_position_x,
      body.banner_position_y,
    );

    if (!position) {
      return NextResponse.json(
        { error: "invalid_banner_position" },
        { status: 400 },
      );
    }

    const { supabase } = await requireAuthorMembership(authorId);

    const { data: existing, error: lookupError } = await supabase
      .from("authors")
      .select("id, banner_url")
      .eq("id", authorId)
      .maybeSingle();

    if (lookupError) {
      console.error("author_banner_position_lookup_error", lookupError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!existing?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (!existing.banner_url?.trim()) {
      return NextResponse.json({ error: "banner_missing" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("authors")
      .update({
        banner_position_x: position.x,
        banner_position_y: position.y,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authorId);

    if (updateError) {
      console.error("author_banner_position_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const profile = await getAuthorProfileDetail(supabase, authorId);

    return NextResponse.json({
      banner_position_x: position.x,
      banner_position_y: position.y,
      profile,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
