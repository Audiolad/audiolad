import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import { hasPermission } from "@/lib/auth/platform-access";
import {
  PRODUCT_SEO_AI_ERROR_MESSAGE,
  productSeoAiError,
  productSeoAiHttpStatus,
} from "@/lib/seo/product-autofill/errors";
import {
  generateProductSeoDraft,
  parseProductSeoAutofillRequest,
} from "@/lib/seo/product-autofill/orchestrate";

export const dynamic = "force-dynamic";

async function requireAuthorSeoToolAccess() {
  const { supabase, user } = await requireAuthenticatedUser();
  const isAdmin = await hasPermission(supabase, user.id, "admin_panel.access");
  if (isAdmin) {
    return { user };
  }

  const workspaces = await listAuthorWorkspacesForUser(user.id, supabase);
  if (workspaces.length === 0) {
    throw new AuthorAccessError("forbidden", 403);
  }

  return { user };
}

/**
 * Author/admin Product SEO Autofill.
 * Returns a local SEO draft only. Does not PATCH, save, or notify search engines.
 */
export async function POST(request: Request) {
  try {
    const { user } = await requireAuthorSeoToolAccess();

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const parsed = parseProductSeoAutofillRequest(body);
    if (!parsed.ok) {
      const fallback = productSeoAiError(parsed.code);
      return NextResponse.json(
        {
          error: fallback.error.message,
          code: fallback.error.code,
        },
        { status: productSeoAiHttpStatus(fallback.error.code) },
      );
    }

    const result = await generateProductSeoDraft(parsed.request, { userId: user.id });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error.message,
          code: result.error.code,
        },
        { status: productSeoAiHttpStatus(result.error.code) },
      );
    }

    return NextResponse.json({
      seoSecondaryQueries: result.data.seoSecondaryQueries,
      seoTitle: result.data.seoTitle,
      seoDescription: result.data.seoDescription,
      seoAbout: result.data.seoAbout,
      usageItems: result.data.usageItems,
      faqItems: result.data.faqItems.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
      secondaryQueryStatus: result.data.secondaryQueryStatus,
    });
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return handleAuthorRouteError(error);
    }

    console.error(
      "product_seo_autofill_route_error",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        error: PRODUCT_SEO_AI_ERROR_MESSAGE,
        code: "PROVIDER_ERROR",
      },
      { status: productSeoAiHttpStatus("PROVIDER_ERROR") },
    );
  }
}
