import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { buildAuthorProjectCookie } from "@/lib/author-projects/selection";
import { isUuid } from "@/lib/author-stats/route-guard";
import { peekAuthorExecutionContext } from "@/lib/author-support/context";
import { shouldNotifyIndexNowByVisibility } from "@/lib/products/catalog-visibility";
import { buildPracticeCanonicalUrl } from "@/lib/products/paths";
import { isPracticePubliclyAvailable } from "@/lib/products/scheduled-publication";
import { scheduleIndexNowNotification } from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";

const transferErrors: Record<string, { status: number; message: string }> = {
  album_transfer_forbidden: {
    status: 403,
    message: "Сменить проект может владелец обоих проектов.",
  },
  album_transfer_not_found: {
    status: 404,
    message: "Альбом не найден.",
  },
  album_transfer_stale: {
    status: 409,
    message: "Проект альбома уже изменился. Обновите страницу.",
  },
  album_transfer_unavailable: {
    status: 409,
    message: "Для этого альбома смена проекта сейчас недоступна.",
  },
  album_transfer_slug_taken: {
    status: 409,
    message: "В одном из проектов этот адрес уже связан с другим альбомом.",
  },
  album_transfer_commercial_required: {
    status: 409,
    message: "Для переноса этого альбома у нового проекта должен быть коммерческий доступ.",
  },
};

export async function POST(request: Request, { params }: RouteContext<"/api/author/products/[id]/transfer">) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const sourceId = typeof body?.source_author_id === "string" ? body.source_author_id : null;
    const targetId = typeof body?.target_author_id === "string" ? body.target_author_id : null;
    if (!isUuid(id) || !sourceId || !isUuid(sourceId) || !targetId || !isUuid(targetId)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const execution = await peekAuthorExecutionContext();
    if (execution?.isSupportMode) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { supabase } = await requirePracticeMutationAccess(id);
    const { data, error } = await supabase.rpc("transfer_author_music_album", {
      p_practice_id: id,
      p_source_author_id: sourceId,
      p_target_author_id: targetId,
    });
    if (error) {
      const known = transferErrors[error.message];
      if (known) {
        return NextResponse.json({ error: error.message, message: known.message }, { status: known.status });
      }
      console.error("author_album_transfer_error", error.code, error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (
      data.product_slug &&
      isPracticePubliclyAvailable({
        status: data.status,
        scheduledPublishAt: data.scheduled_publish_at,
        publishedAt: data.published_at,
      }) &&
      shouldNotifyIndexNowByVisibility(data.catalog_visibility, data.is_catalog_listed)
    ) {
      scheduleIndexNowNotification(
        [data.source_slug, data.target_slug].map((slug) =>
          buildPracticeCanonicalUrl(slug, data.product_slug),
        ),
        INDEXNOW_REASONS.practice_updated,
        { entityType: "practice", entityId: id },
      );
    }

    const response = NextResponse.json({ author_slug: data.target_slug });
    response.headers.append("Set-Cookie", buildAuthorProjectCookie(data.target_slug));
    return response;
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
