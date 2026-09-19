import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import {
  buildAuthorProjectCookie,
  buildClearedAuthorProjectCookie,
} from "@/lib/author-projects/selection";
import {
  changeAuthorSlug,
  deleteEmptyAuthorSpace,
  getCanChangeAuthorSlug,
  getCanDeleteAuthorSpace,
  humanizeAuthorSpaceEligibility,
  normalizeAuthorSpaceSlugInput,
} from "@/lib/authors/space-ops";
import {
  buildAuthorPublicPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";
import {
  buildAuthorCanonicalUrl,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";

export async function GET(request: Request) {
  try {
    const authorId = new URL(request.url).searchParams.get("author_id")?.trim();
    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMembership(authorId);
    const [canChange, canDelete] = await Promise.all([
      getCanChangeAuthorSlug(supabase, authorId),
      getCanDeleteAuthorSpace(supabase, authorId),
    ]);

    return NextResponse.json({
      can_change_slug: canChange.allowed,
      change_code: canChange.code,
      change_message: humanizeAuthorSpaceEligibility(canChange),
      change_as_admin: canChange.asAdmin === true,
      can_delete: canDelete.allowed,
      delete_code: canDelete.code,
      delete_message: humanizeAuthorSpaceEligibility(canDelete),
      delete_blockers: canDelete.blockers ?? [],
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authorId =
      typeof body.author_id === "string" ? body.author_id.trim() : "";
    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const normalized = normalizeAuthorSpaceSlugInput(body.slug);
    if (!normalized) {
      return NextResponse.json({ error: "slug_invalid" }, { status: 400 });
    }

    const { supabase, role } = await requireAuthorMembership(authorId);
    const result = await changeAuthorSlug(supabase, authorId, normalized);

    if (!result.ok) {
      const status =
        result.code === "forbidden"
          ? 403
          : result.code === "slug_taken" ||
              result.code === "slug_change_locked" ||
              result.code === "slug_change_locked_published" ||
              result.code === "slug_change_locked_finance"
            ? 409
            : result.code === "slug_invalid"
              ? 400
              : 500;
      return NextResponse.json(
        {
          error: result.code,
          message: humanizeAuthorSpaceEligibility({
            allowed: false,
            code: result.code,
          }),
          role,
        },
        { status },
      );
    }

    const payload = result.result;
    revalidatePath(buildAuthorPublicPath(payload.slug));
    if (!payload.noop && payload.previousSlug !== payload.slug) {
      revalidatePath(buildAuthorPublicPath(payload.previousSlug));
    }
    revalidatePath("/authors");
    revalidatePath("/sitemap.xml");

    if (!payload.noop) {
      scheduleIndexNowNotification(
        [
          buildAuthorCanonicalUrl(payload.slug),
          buildAuthorCanonicalUrl(payload.previousSlug),
        ],
        INDEXNOW_REASONS.author_profile_updated,
      );
    }

    const response = NextResponse.json({
      ok: true,
      noop: payload.noop,
      author_id: payload.authorId,
      slug: payload.slug,
      previous_slug: payload.previousSlug,
      name: payload.name ?? null,
      public_path: buildAuthorPublicPath(payload.slug),
      preview_practice_path_example: buildPracticePublicPath(
        payload.slug,
        "example-product",
      ),
    });
    response.headers.append(
      "Set-Cookie",
      buildAuthorProjectCookie(payload.slug),
    );
    return response;
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    let authorId = url.searchParams.get("author_id")?.trim() ?? "";
    if (!authorId) {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (typeof body.author_id === "string") {
          authorId = body.author_id.trim();
        }
      } catch {
        // no JSON body
      }
    }
    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMembership(authorId);
    const result = await deleteEmptyAuthorSpace(supabase, authorId);

    if (!result.ok) {
      const status =
        result.code === "forbidden"
          ? 403
          : result.code === "delete_blocked" ||
              result.code === "delete_blocked_dependency"
            ? 409
            : 500;
      return NextResponse.json(
        {
          error: result.code,
          message: humanizeAuthorSpaceEligibility({
            allowed: false,
            code: result.code,
            blockers: result.blockers,
          }),
          blockers: result.blockers ?? [],
        },
        { status },
      );
    }

    revalidatePath(buildAuthorPublicPath(result.result.slug));
    revalidatePath("/authors");
    revalidatePath("/sitemap.xml");

    const response = NextResponse.json({
      ok: true,
      author_id: result.result.authorId,
      slug: result.result.slug,
      name: result.result.name,
    });
    response.headers.append("Set-Cookie", buildClearedAuthorProjectCookie());
    return response;
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
