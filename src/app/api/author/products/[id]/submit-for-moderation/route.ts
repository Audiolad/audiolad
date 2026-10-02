import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  PRODUCT_MODERATION_MISSING_COVER_CODE,
  PRODUCT_MODERATION_MISSING_COVER_MESSAGE,
  canSubmitPracticeForModeration,
  hasProductCoverForModeration,
} from "@/lib/author-products/moderation";
import { submitPracticeForModeration } from "@/lib/author-products/moderation-actions";
import { countCoursePublishContent } from "@/lib/author-products/course-builder";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { evaluatePublishReadiness } from "@/lib/author-products/publish";
import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
import { countActivePracticeTopics } from "@/lib/topics/queries";
import {
  AUDIO_SPRINT_CLASS_MISMATCH_CODE,
  AUDIO_SPRINT_CLASS_MISMATCH_MESSAGE,
  evaluateAudioSprintModerationGate,
} from "@/lib/seo-queries/audio-sprint";
import { loadAudioSprintModerationQuery } from "@/lib/seo-queries/list-audio-sprint-queries";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, accessStatus } = await requirePracticeMutationAccess(id);
    const detail = await getAuthorProductDetail(supabase, id);

    if (!detail) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (
      !canSubmitPracticeForModeration({
        status: detail.practice.status,
        moderationStatus: detail.practice.moderation_status,
        deletedAt: detail.practice.deleted_at,
      })
    ) {
      return NextResponse.json(
        {
          error: "invalid_moderation_status_for_submit",
          message:
            detail.practice.deleted_at
              ? "Удалённый продукт нельзя отправить на модерацию."
              : "В текущем статусе продукт нельзя отправить на модерацию.",
        },
        { status: 400 },
      );
    }

    if (
      !hasProductCoverForModeration({
        coverUrl: detail.practice.cover_url,
        coverImage: detail.practice.cover_image ?? null,
      })
    ) {
      return NextResponse.json(
        {
          error: PRODUCT_MODERATION_MISSING_COVER_CODE,
          publishReady: false,
          message: PRODUCT_MODERATION_MISSING_COVER_MESSAGE,
        },
        { status: 400 },
      );
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
            "Продукт ещё не готов к отправке на модерацию.",
          requirements: readiness.requirements,
        },
        { status: 400 },
      );
    }

    const sprintQuery = await loadAudioSprintModerationQuery(
      supabase,
      detail.practice.primary_seo_query_id,
    );
    if (!sprintQuery.ok) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    if (sprintQuery.queryText && !sprintQuery.authorGroup) {
      return NextResponse.json(
        {
          error: AUDIO_SPRINT_CLASS_MISMATCH_CODE,
          message: AUDIO_SPRINT_CLASS_MISMATCH_MESSAGE,
        },
        { status: 400 },
      );
    }
    const sprintGate = evaluateAudioSprintModerationGate({
      isSprintProduct: Boolean(sprintQuery.queryText),
      authorGroup: sprintQuery.authorGroup,
      publicationClass: detail.practice.publication_class,
      productKind: detail.practice.product_kind,
      isFree: detail.practice.is_free === true,
      catalogVisibility: detail.practice.catalog_visibility,
      isCatalogListed: detail.practice.is_catalog_listed === true,
      title: detail.practice.title,
      queryText: sprintQuery.queryText ?? "",
      subtitle: detail.practice.subtitle,
      description: detail.practice.description,
      seoTitle: detail.practice.seo_title,
      seoDescription: detail.practice.seo_description,
      usageItems: detail.seo_content.usageItems,
      faqItems: detail.seo_content.faqItems,
      coverUrl: detail.practice.cover_url,
      coverImage: detail.practice.cover_image ?? null,
    });
    if (sprintGate) {
      return NextResponse.json(
        { error: sprintGate.code, message: sprintGate.message },
        { status: 400 },
      );
    }

    try {
      await submitPracticeForModeration(supabase, id);
      await recordAuthorSupportAudit({
        action: "product_submitted_for_moderation",
        resourceType: "practice",
        resourceId: id,
      });
    } catch (submitError) {
      if (
        submitError &&
        typeof submitError === "object" &&
        "code" in submitError &&
        "message" in submitError
      ) {
        const mapped = submitError as {
          code: string;
          message: string;
          status?: number;
        };

        return NextResponse.json(
          {
            error: mapped.code,
            message: mapped.message,
          },
          { status: mapped.status ?? 400 },
        );
      }

      console.error("author_submit_moderation_error", id, submitError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);
    const attempt = product?.practice.moderation_attempt ?? 1;
    const isResubmit = attempt > 1;

    return NextResponse.json({
      product,
      message: isResubmit
        ? "Продукт повторно отправлен на модерацию."
        : "Продукт отправлен на модерацию.",
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
