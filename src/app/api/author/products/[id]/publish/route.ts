import { NextResponse } from "next/server";

import {
  assertAuthorCommercialWriteAllowed,
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { assertPublishModerationAllowed } from "@/lib/author-products/moderation";
import { countCoursePublishContent } from "@/lib/author-products/course-builder";
import {
  evaluatePublishReadiness,
  publishPracticeProduct,
  resolveFormatForPublish,
} from "@/lib/author-products/publish";
import { registerPracticeLegacySlug } from "@/lib/products/lookup";
import {
  countAuthorPublishedPractices,
  loadAuthorSlug,
  planPracticePublishIndexNow,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { countActivePracticeTopics } from "@/lib/topics/queries";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, accessStatus, user } = await requirePracticeMutationAccess(id);
    const detail = await getAuthorProductDetail(supabase, id);

    if (!detail) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (!detail.practice.is_free) {
      await assertAuthorCommercialWriteAllowed(
        practice.author_id,
        accessStatus,
      );
    }

    const moderationGate = await assertPublishModerationAllowed(
      supabase,
      detail.practice,
      user.id,
    );

    if (!moderationGate.ok) {
      return NextResponse.json(
        {
          error: moderationGate.code,
          message: moderationGate.message,
        },
        { status: moderationGate.status },
      );
    }

    const resolvedFormat = resolveFormatForPublish(
      detail.practice,
      detail.audio_items,
    );

    if (
      resolvedFormat &&
      resolvedFormat !== (detail.practice.format?.trim() || null)
    ) {
      const { error: formatSyncError } = await supabase
        .from("practices")
        .update({
          format: resolvedFormat,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (formatSyncError) {
        console.error("author_publish_format_sync_error", id, formatSyncError.message);
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      detail.practice.format = resolvedFormat;
    }

    const activeTopicCount = await countActivePracticeTopics(supabase, id);
    const courseContent = await countCoursePublishContent(supabase, id);
    const readiness = evaluatePublishReadiness(
      detail.practice,
      detail.audio_items,
      {
        accessStatus,
        activeTopicCount,
        courseContent,
      },
    );

    if (!readiness.ok) {
      return NextResponse.json(
        {
          error: readiness.firstFailure?.code ?? "publish_not_ready",
          publishReady: false,
          message:
            readiness.firstFailure?.message ??
            "Продукт ещё не готов к публикации.",
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const publishedAt = practice.published_at ?? now;
    const isFirstPublishOfPractice = !practice.published_at;
    const publishedCountBefore = isFirstPublishOfPractice
      ? await countAuthorPublishedPractices(supabase, practice.author_id)
      : 0;

    try {
      await publishPracticeProduct(supabase, id, publishedAt);
    } catch (publishError) {
      if (
        publishError &&
        typeof publishError === "object" &&
        "code" in publishError &&
        "message" in publishError
      ) {
        const mapped = publishError as {
          code: string;
          message: string;
          status?: number;
        };

        console.error("author_publish_domain_error", id, mapped.code);

        return NextResponse.json(
          {
            error: mapped.code,
            message: mapped.message,
          },
          { status: mapped.status ?? 400 },
        );
      }

      console.error("author_publish_atomic_error", id);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    try {
      const { data: publishedPractice } = await supabase
        .from("practices")
        .select("slug")
        .eq("id", id)
        .maybeSingle();

      if (publishedPractice?.slug) {
        await registerPracticeLegacySlug(
          supabase,
          id,
          publishedPractice.slug as string,
        );
      }
    } catch {
      console.error("author_publish_legacy_slug_error", id);
    }

    const product = await getAuthorProductDetail(supabase, id);

    if (product?.practice.slug) {
      const authorSlug = await loadAuthorSlug(supabase, practice.author_id);

      if (authorSlug) {
        for (const event of planPracticePublishIndexNow({
          authorSlug,
          practiceSlug: product.practice.slug,
          isFirstPublishOfPractice,
          publishedCountBefore,
        })) {
          scheduleIndexNowNotification(event.urls, event.reason);
        }
      }
    }

    return NextResponse.json({ product, message: "Аудиопродукт опубликован." });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
