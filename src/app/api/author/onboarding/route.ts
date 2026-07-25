import { NextResponse } from "next/server";

import { loadAuthorOnboardingChecklistState } from "@/lib/author-dashboard/load-onboarding-state";
import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const authorId = url.searchParams.get("author_id")?.trim();

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, accessStatus } = await requireAuthorMembership(authorId);

    const { data: author, error } = await supabase
      .from("authors")
      .select("id, slug")
      .eq("id", authorId)
      .maybeSingle();

    if (error) {
      console.error("author_onboarding_author_lookup_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!author?.id || !author.slug) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const checklist = await loadAuthorOnboardingChecklistState(supabase, {
      authorId: author.id,
      authorSlug: author.slug,
      accessStatus,
    });

    return NextResponse.json({ checklist });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
