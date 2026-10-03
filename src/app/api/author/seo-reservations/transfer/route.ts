import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";

function readString(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function transferErrorResponse(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";

  if (message.includes("seo_reservation_expired")) {
    return NextResponse.json(
      {
        error: "seo_reservation_expired",
        code: "seo_reservation_expired",
        message: "Бронирование поискового запроса истекло.",
      },
      { status: 409 },
    );
  }

  if (message.includes("seo_reservation_limit_reached")) {
    return NextResponse.json(
      {
        error: "seo_reservation_limit_reached",
        code: "seo_reservation_limit_reached",
        message:
          "В выбранном авторском пространстве уже 5 запросов в работе. Завершите или освободите один из них.",
      },
      { status: 409 },
    );
  }

  if (message.includes("seo_reservation_already_linked")) {
    return NextResponse.json(
      {
        error: "seo_reservation_already_linked",
        code: "seo_reservation_already_linked",
        message:
          "Этот запрос уже связан с продуктом. Перенести можно только бронь, по которой продукт ещё не создан.",
      },
      { status: 409 },
    );
  }

  if (message.includes("seo_reservation_not_transferable")) {
    return NextResponse.json(
      {
        error: "seo_reservation_not_transferable",
        code: "seo_reservation_not_transferable",
        message: "Эту бронь уже нельзя перенести.",
      },
      { status: 409 },
    );
  }

  if (message.includes("forbidden")) {
    return NextResponse.json(
      {
        error: "forbidden",
        code: "forbidden",
        message:
          "Недостаточно прав для переноса брони между этими авторскими пространствами.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      error: "seo_reservation_transfer_failed",
      code: "seo_reservation_transfer_failed",
      message: "Не удалось перенести бронь. Попробуйте ещё раз.",
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          error: "invalid_request",
          code: "invalid_request",
          message: "Не удалось прочитать запрос.",
        },
        { status: 400 },
      );
    }

    const reservationId = readString(body, "reservation_id");
    const targetAuthorId = readString(body, "target_author_id");
    if (!reservationId || !targetAuthorId) {
      return NextResponse.json(
        {
          error: "invalid_request",
          code: "invalid_request",
          message: "Укажите бронирование и авторское пространство.",
        },
        { status: 400 },
      );
    }

    const targetContext = await requireAuthorMutationMembership(targetAuthorId);
    const { data: reservation, error: reservationError } =
      await targetContext.supabase
        .from("seo_query_reservations")
        .select("id, author_id")
        .eq("id", reservationId)
        .maybeSingle();

    if (reservationError || !reservation?.id || !reservation.author_id) {
      return NextResponse.json(
        {
          error: "seo_reservation_not_found",
          code: "seo_reservation_not_found",
          message: "Бронирование поискового запроса не найдено.",
        },
        { status: 404 },
      );
    }

    const sourceAuthorId = String(reservation.author_id);
    if (sourceAuthorId !== targetAuthorId) {
      await requireAuthorMutationMembership(sourceAuthorId);
    }

    const { data, error } = await targetContext.supabase.rpc(
      "transfer_seo_query_reservation",
      {
        p_reservation_id: reservationId,
        p_target_author_id: targetAuthorId,
      },
    );

    if (error) {
      return transferErrorResponse(error);
    }

    return NextResponse.json({
      reservation: data,
      message: "Бронь перенесена в выбранное авторское пространство.",
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
