import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { canSubmitPracticeForModeration } from "@/lib/author-products/moderation";
import { submitPracticeForModeration } from "@/lib/author-products/moderation-actions";
import { countCoursePublishContent } from "@/lib/author-products/course-builder";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { evaluatePublishReadiness } from "@/lib/author-products/publish";
import { countActivePracticeTopics } from "@/lib/topics/queries";

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

    try {
      await submitPracticeForModeration(supabase, id);
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
