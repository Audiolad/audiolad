import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { assertPracticePublicContentEditableForActor } from "@/lib/author-products/moderation-actor";
import {
  getJazzRelaxPassportStatus,
  JazzRelaxPassportError,
  runJazzRelaxPassportAction,
} from "@/lib/music-passport/jazz-relax-pilot";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function passportErrorResponse(error: unknown) {
  if (error instanceof JazzRelaxPassportError) {
    const message = error.code === "tracks_not_ready"
      ? "Сначала загрузите аудио и дождитесь подготовки файлов."
      : error.code === "jazz_relax_passport_forbidden"
        ? "Музыкальный паспорт доступен только для этого проекта."
        : "Не удалось обновить музыкальный паспорт.";
    return NextResponse.json({ error: message, code: error.code }, { status: error.status });
  }
  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { practice } = await requirePracticeAccess(id);
    const status = await getJazzRelaxPassportStatus({
      practiceId: id,
      authorId: practice.author_id,
      productKind: practice.product_kind,
    });
    return NextResponse.json(status);
  } catch (error) {
    const mapped = passportErrorResponse(error);
    if (mapped) return mapped;
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
    await assertPracticePublicContentEditableForActor(supabase, practice, user.id);
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const record = body && typeof body === "object" ? body as { action?: unknown; audioItemId?: unknown } : {};
    const action = record.action;
    if (action !== "start" && action !== "retry" && action !== "reanalyze") {
      return NextResponse.json({ error: "Некорректное действие.", code: "invalid_action" }, { status: 400 });
    }
    const audioItemId = typeof record.audioItemId === "string" ? record.audioItemId : null;
    const status = await runJazzRelaxPassportAction({
      practiceId: id,
      authorId: practice.author_id,
      productKind: practice.product_kind,
      userId: user.id,
      action,
      audioItemId,
    });
    return NextResponse.json(status);
  } catch (error) {
    const mapped = passportErrorResponse(error);
    if (mapped) return mapped;
    return handleAuthorRouteError(error);
  }
}
