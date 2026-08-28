import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  getUnpublishBlockerMessage,
  getProductLifecycleBlockers,
} from "@/lib/author-products/lifecycle";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { unpublishPracticeProduct } from "@/lib/author-products/publish";
import { buildPracticeCanonicalUrl } from "@/lib/products/paths";
import {
  loadAuthorSlug,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import { shouldNotifyIndexNowByVisibility } from "@/lib/products/catalog-visibility";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);
    const serviceSupabase = createServiceRoleClient();

    const unpublishBlockerMessage = getUnpublishBlockerMessage(
      await getProductLifecycleBlockers(serviceSupabase, id),
    );

    if (unpublishBlockerMessage) {
      return NextResponse.json(
        {
          error: "starter_bundle",
          message: unpublishBlockerMessage,
        },
        { status: 409 },
      );
    }

    const previousSlug = practice.slug;
    const authorSlug = previousSlug
      ? await loadAuthorSlug(supabase, practice.author_id)
      : null;

    try {
      await unpublishPracticeProduct(supabase, id);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
      ) {
        const mapped = error as {
          message: string;
          code?: string;
          status?: number;
        };
        return NextResponse.json(
          {
            error: mapped.code ?? "practice_unpublish_failed",
            message: mapped.message,
          },
          { status: mapped.status ?? 409 },
        );
      }

      console.error("author_unpublish_error", id, error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    if (
      authorSlug &&
      previousSlug &&
      shouldNotifyIndexNowByVisibility(
        (practice as { catalog_visibility?: string | null }).catalog_visibility,
        (practice as { is_catalog_listed?: boolean | null }).is_catalog_listed,
      )
    ) {
      scheduleIndexNowNotification(
        [buildPracticeCanonicalUrl(authorSlug, previousSlug)],
        INDEXNOW_REASONS.practice_unpublished,
      );
    }

    return NextResponse.json({
      product,
      message: "Аудиопродукт снят с публикации.",
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
