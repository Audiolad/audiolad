import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import {
  AUTHOR_PROJECT_DESCRIPTION_MAX,
} from "@/lib/author-projects/constants";
import {
  createAuthorProjectViaRpc,
  getAuthorProjectsSummary,
} from "@/lib/author-projects/server";
import {
  validateAuthorProjectName,
  validateAuthorProjectSlug,
} from "@/lib/author-projects/slug";
import { buildAuthorProjectCookie } from "@/lib/author-projects/selection";

export async function GET() {
  try {
    const { supabase, user } = await requireAuthenticatedUser();
    const summary = await getAuthorProjectsSummary(user.id, supabase);

    return NextResponse.json({
      projects: summary.projects,
      owned_count: summary.ownedCount,
      limit: summary.limit,
      source: summary.source,
      premium_enabled: summary.premiumEnabled,
      has_override: summary.hasOverride,
      can_create: summary.canCreate,
      show_premium_upsell: summary.showPremiumUpsell,
      limit_message: summary.limitMessage,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireAuthenticatedUser();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const name =
      "name" in body && typeof body.name === "string" ? body.name.trim() : "";
    const slugRaw =
      "slug" in body && typeof body.slug === "string" ? body.slug.trim() : "";
    const shortDescription =
      "short_description" in body && typeof body.short_description === "string"
        ? body.short_description.trim()
        : "";

    const nameError = validateAuthorProjectName(name);
    if (nameError) {
      return NextResponse.json(
        { error: "invalid_project_name", message: nameError },
        { status: 400 },
      );
    }

    if (slugRaw) {
      const slugError = validateAuthorProjectSlug(slugRaw);
      if (slugError) {
        return NextResponse.json(
          { error: "invalid_project_slug", message: slugError },
          { status: 400 },
        );
      }
    }

    if (shortDescription.length > AUTHOR_PROJECT_DESCRIPTION_MAX) {
      return NextResponse.json(
        { error: "invalid_project_description" },
        { status: 400 },
      );
    }

    const created = await createAuthorProjectViaRpc(supabase, {
      name,
      slug: slugRaw || null,
      shortDescription: shortDescription || null,
    });

    const response = NextResponse.json(
      {
        project: {
          id: created.authorId,
          slug: created.slug,
          name: created.name,
        },
        used: created.used,
        limit: created.limit,
      },
      { status: 201 },
    );
    response.headers.append("Set-Cookie", buildAuthorProjectCookie(created.slug));
    return response;
  } catch (error) {
    if (
      error instanceof AuthorAccessError &&
      error.code === "author_project_limit_reached"
    ) {
      return NextResponse.json(
        {
          error: error.code,
          message:
            "Лимит проектов исчерпан. Увеличьте лимит в Premium или обратитесь к администратору.",
        },
        { status: 403 },
      );
    }

    return handleAuthorRouteError(error);
  }
}
