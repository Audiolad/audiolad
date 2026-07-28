import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  getArchiveBlockerMessage,
  getProductLifecycleBlockers,
} from "@/lib/author-products/lifecycle";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { archivePracticeProduct } from "@/lib/author-products/publish";
import { buildPracticeCanonicalUrl } from "@/lib/products/paths";
import {
  loadAuthorSlug,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);
    const serviceSupabase = createServiceRoleClient();

    const archiveBlockerMessage = getArchiveBlockerMessage(
      await getProductLifecycleBlockers(serviceSupabase, id),
    );

    if (archiveBlockerMessage) {
      return NextResponse.json(
        {
          error: "starter_bundle",
          message: archiveBlockerMessage,
        },
        { status: 409 },
      );
    }

    const wasPubliclyIndexed =
      practice.status === "published" || practice.status === "unpublished";
    const previousSlug = practice.slug;
    const authorSlug =
      wasPubliclyIndexed && previousSlug
        ? await loadAuthorSlug(supabase, practice.author_id)
        : null;

    try {
      await archivePracticeProduct(supabase, id);
    } catch {
      console.error("author_archive_error", id);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    if (authorSlug && previousSlug && wasPubliclyIndexed) {
      scheduleIndexNowNotification(
        [buildPracticeCanonicalUrl(authorSlug, previousSlug)],
        INDEXNOW_REASONS.practice_archived,
      );
    }

    return NextResponse.json({
      product,
      message: "Аудиопродукт перемещён в архив.",
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
