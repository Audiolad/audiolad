import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
  requireAuthorMutationMembership,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import { hasPermission } from "@/lib/auth/platform-access";
import { productSeoAiHttpStatus } from "@/lib/seo/product-autofill/errors";
import { isAuthorProductQualityReviewEnabled } from "@/lib/seo/product-quality-review/beta";
import { reviewProductTextQuality } from "@/lib/seo/product-quality-review/orchestrate";
import { PRODUCT_QUALITY_REVIEW_FAIL_OPEN_MESSAGE } from "@/lib/seo/product-quality-review/ui";

export const dynamic = "force-dynamic";

async function requireQualityReviewAccess(authorId: string) {
  const { supabase, user } = await requireAuthenticatedUser();
  const isAdmin = await hasPermission(supabase, user.id, "admin_panel.access");
  if (isAdmin) {
    return { user };
  }
  await requireAuthorMutationMembership(authorId);
  return { user };
}

/**
 * Aurafon-only on-page product text quality review.
 * Analysis only: no save, PATCH, publish, or reservation changes.
 */
export async function POST(request: Request) {
  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const authorId =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as Record<string, unknown>).authorId === "string"
        ? String((body as Record<string, unknown>).authorId).trim()
        : "";

    if (!authorId || !isAuthorProductQualityReviewEnabled(authorId)) {
      return NextResponse.json(
        {
          error: "Проверка текстов доступна только в закрытой бете.",
          code: "product_quality_review_beta_disabled",
        },
        { status: 403 },
      );
    }

    await requireQualityReviewAccess(authorId);

    const result = await reviewProductTextQuality(body);
    if (!result.ok) {
      const code = result.error.code;
      if (
        code === "invalid_request" ||
        code === "missing_primary" ||
        code === "product_quality_review_beta_disabled"
      ) {
        return NextResponse.json(
          { error: result.error.message, code },
          {
            status:
              code === "product_quality_review_beta_disabled"
                ? 403
                : code === "missing_primary"
                  ? 400
                  : 400,
          },
        );
      }

      return NextResponse.json(
        {
          error: PRODUCT_QUALITY_REVIEW_FAIL_OPEN_MESSAGE,
          code,
        },
        {
          status: productSeoAiHttpStatus(
            code === "INVALID_OUTPUT" ? "PROVIDER_ERROR" : code,
          ),
        },
      );
    }

    return NextResponse.json({
      status: result.result.status,
      summary: result.result.summary,
      issues: result.result.issues,
      positiveNotes: result.result.positiveNotes,
    });
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return handleAuthorRouteError(error);
    }

    console.error(
      "product_quality_review_route_error",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        error: PRODUCT_QUALITY_REVIEW_FAIL_OPEN_MESSAGE,
        code: "PROVIDER_ERROR",
      },
      { status: productSeoAiHttpStatus("PROVIDER_ERROR") },
    );
  }
}
