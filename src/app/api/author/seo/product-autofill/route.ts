import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import {
  bindJazzRelaxDescriptionAlbumPassport,
  jazzRelaxAlbumFactsForDescription,
} from "@/lib/music-passport/jazz-relax-pilot";
import { hasPermission } from "@/lib/auth/platform-access";
import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
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
 * Jazz Relax may record generated_from_album_passport_version_id. It does not
 * rewrite the description or SEO fields, and a later re-analysis does not move
 * an existing binding.
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

    const practiceId = body
      && typeof body === "object"
      && typeof (body as { practiceId?: unknown }).practiceId === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        (body as { practiceId: string }).practiceId,
      )
      ? (body as { practiceId: string }).practiceId
      : null;
    let albumPassportVersionId: string | null = null;
    let descriptionAlreadyBound = false;
    let requestForDraft = parsed.request;
    if (practiceId) {
      const access = await requirePracticeAccess(practiceId);
      try {
        const passport = await jazzRelaxAlbumFactsForDescription({
          practiceId,
          authorId: access.practice.author_id,
          productKind: access.practice.product_kind,
        });
        albumPassportVersionId = passport.albumPassportVersionId;
        descriptionAlreadyBound = passport.alreadyBound;
        if (passport.facts) {
          requestForDraft = {
            ...parsed.request,
            musicPassportFacts: passport.facts,
          };
        }
      } catch (passportError) {
        console.error(
          "jazz_relax_passport_facts_failed",
          passportError instanceof Error ? passportError.name : "unknown",
        );
      }
    }

    const result = await generateProductSeoDraft(requestForDraft, { userId: user.id });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error.message,
          code: result.error.code,
          ...(result.error.code === "INVALID_OUTPUT" &&
          result.error.diagnostic
            ? { diagnostic: result.error.diagnostic }
            : {}),
        },
        { status: productSeoAiHttpStatus(result.error.code) },
      );
    }

    await recordAuthorSupportAudit({
      action: "author_seo_tool_used",
      resourceType: "author_seo",
      metadata: { tool: "product_autofill" },
    });

    let generatedFromAlbumPassportVersionId: string | null = null;
    if (practiceId && albumPassportVersionId && !descriptionAlreadyBound) {
      generatedFromAlbumPassportVersionId = await bindJazzRelaxDescriptionAlbumPassport({
        practiceId,
        albumPassportVersionId,
      });
    } else if (descriptionAlreadyBound) {
      generatedFromAlbumPassportVersionId = albumPassportVersionId;
    }

    return NextResponse.json({
      seoSecondaryQueries: result.data.seoSecondaryQueries,
      seoTitle: result.data.seoTitle,
      seoDescription: result.data.seoDescription,
      usageItems: result.data.usageItems,
      faqItems: result.data.faqItems.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
      ...(generatedFromAlbumPassportVersionId
        ? { generated_from_album_passport_version_id: generatedFromAlbumPassportVersionId }
        : {}),
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
