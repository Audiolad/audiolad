import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";
import {
  SEO_DISCOVERY_BETA_DISABLED_MESSAGE,
  isMusicCreateSeoDiscoveryEnabled,
} from "@/lib/seo-queries/discovery-beta";
import { SEO_QUERY_OCCUPIED_BY_PUBLISHED_PRODUCT_MESSAGE } from "@/lib/seo-queries/published-query-occupancy";
import { isSeoReservationProductLinkAllowed } from "@/lib/seo-queries/reservation-product-link-gate";

function readString(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function seoDiscoveryDisabledResponse() {
  return NextResponse.json(
    {
      error: "seo_discovery_beta_disabled",
      code: "seo_discovery_beta_disabled",
      message: SEO_DISCOVERY_BETA_DISABLED_MESSAGE,
    },
    { status: 403 },
  );
}

function reservationErrorResponse(
  mapped: { error: string; message: string; status: number } | null,
  fallbackError: string,
  fallbackMessage: string,
) {
  if (!mapped) {
    return NextResponse.json(
      {
        error: fallbackError,
        code: fallbackError,
        message: fallbackMessage,
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: mapped.error, code: mapped.error, message: mapped.message },
    { status: mapped.status },
  );
}

function musicCreateSeoDiscoveryAllowed(body: Record<string, unknown>): boolean {
  return isMusicCreateSeoDiscoveryEnabled({
    authorId: readString(body, "author_id"),
    publicationClass: readString(body, "publication_class"),
  });
}

function mapReservationError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("seo_query_occupied_by_published_product")) {
    return {
      error: "seo_query_occupied_by_published_product",
      message: SEO_QUERY_OCCUPIED_BY_PUBLISHED_PRODUCT_MESSAGE,
      status: 409,
    };
  }
  if (message.includes("seo_query_already_reserved")) {
    return { error: "seo_query_already_reserved", message: "Этот запрос уже взял другой автор. Выберите другой.", status: 409 };
  }
  if (message.includes("seo_reservation_limit_reached")) {
    return { error: "seo_reservation_limit_reached", message: "У вас уже 5 запросов в работе. Завершите или освободите один из них.", status: 409 };
  }
  if (message.includes("seo_reservation_product_lifecycle_locked")) {
    return { error: "seo_reservation_product_lifecycle_locked", message: "Запрос нельзя освободить после отправки продукта на модерацию или публикации.", status: 409 };
  }
  if (message.includes("seo_reservation_expired")) {
    return { error: "seo_reservation_expired", message: "Бронирование поискового запроса истекло.", status: 409 };
  }
  if (message.includes("seo_reservation_already_linked")) {
    return { error: "seo_reservation_already_linked", message: "Этот поисковый запрос уже связан с другим продуктом.", status: 409 };
  }
  if (message.includes("practice_already_has_primary_seo_query")) {
    return { error: "practice_already_has_primary_seo_query", message: "У продукта уже есть другой основной поисковый запрос.", status: 409 };
  }
  if (message.includes("seo_query_too_long_for_product")) {
    return { error: "seo_query_too_long_for_product", message: "Этот поисковый запрос слишком длинный для основного запроса продукта.", status: 409 };
  }
  if (message.includes("seo_reservation_product_not_linkable")) {
    return { error: "seo_reservation_product_not_linkable", message: "Связать запрос можно только с черновиком до отправки на модерацию.", status: 409 };
  }
  if (message.includes("seo_reservation_product_not_music")) {
    return {
      error: "seo_reservation_product_not_music",
      message: "Связать запрос можно только с музыкальным продуктом.",
      status: 403,
    };
  }
  return null;
}

function seoReservationProductNotMusicResponse() {
  return NextResponse.json(
    {
      error: "seo_reservation_product_not_music",
      code: "seo_reservation_product_not_music",
      message: "Связать запрос можно только с музыкальным продуктом.",
    },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const authorId = readString(body, "author_id");
    const queryId = readString(body, "query_id");
    if (!authorId || !queryId) {
      return NextResponse.json(
        {
          error: "invalid_request",
          code: "invalid_request",
          message: "Укажите автора и поисковый запрос.",
        },
        { status: 400 },
      );
    }
    if (!musicCreateSeoDiscoveryAllowed(body)) return seoDiscoveryDisabledResponse();

    const { supabase } = await requireAuthorMutationMembership(authorId);
    const { data, error } = await supabase.rpc("reserve_seo_query", {
      p_query_id: queryId,
      p_author_id: authorId,
    });
    if (error) {
      return reservationErrorResponse(
        mapReservationError(error),
        "seo_reservation_failed",
        "Не удалось закрепить запрос.",
      );
    }
    return NextResponse.json({ reservation: data, message: "Запрос закреплен за вами" }, { status: 201 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const authorId = readString(body, "author_id");
    const reservationId = readString(body, "reservation_id");
    if (!authorId || !reservationId) {
      return NextResponse.json(
        {
          error: "invalid_request",
          code: "invalid_request",
          message: "Укажите автора и бронирование.",
        },
        { status: 400 },
      );
    }
    if (!musicCreateSeoDiscoveryAllowed(body)) return seoDiscoveryDisabledResponse();

    const { supabase } = await requireAuthorMutationMembership(authorId);
    const { data, error } = await supabase.rpc("release_seo_query_reservation", {
      p_reservation_id: reservationId,
    });
    if (error) {
      return reservationErrorResponse(
        mapReservationError(error),
        "seo_reservation_release_failed",
        "Не удалось освободить запрос.",
      );
    }
    return NextResponse.json({ reservation: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const authorId = readString(body, "author_id");
    const reservationId = readString(body, "reservation_id");
    const productId = readString(body, "product_id");
    if (!authorId || !reservationId || !productId) {
      return NextResponse.json(
        {
          error: "invalid_request",
          code: "invalid_request",
          message: "Укажите автора, бронирование и продукт.",
        },
        { status: 400 },
      );
    }

    const { supabase } = await requireAuthorMutationMembership(authorId);
    const { data: practice, error: practiceError } = await supabase
      .from("practices")
      .select("id, author_id, product_kind, publication_class, deleted_at")
      .eq("id", productId)
      .maybeSingle();

    if (
      practiceError
      || !practice?.id
      || practice.deleted_at
      || typeof practice.author_id !== "string"
    ) {
      return NextResponse.json(
        {
          error: "practice_not_found",
          code: "practice_not_found",
          message: "Продукт не найден.",
        },
        { status: 404 },
      );
    }

    // Body publication_class is not proof. The loaded practices row is.
    if (
      !isSeoReservationProductLinkAllowed({
        authorId: practice.author_id,
        productKind: typeof practice.product_kind === "string" ? practice.product_kind : null,
        publicationClass:
          typeof practice.publication_class === "string" ? practice.publication_class : null,
      })
    ) {
      return seoReservationProductNotMusicResponse();
    }

    const { data, error } = await supabase.rpc("link_seo_reservation_to_product", {
      p_reservation_id: reservationId,
      p_product_id: productId,
    });
    if (error) {
      return reservationErrorResponse(
        mapReservationError(error),
        "seo_reservation_link_failed",
        "Не удалось связать запрос с продуктом.",
      );
    }
    return NextResponse.json({ reservation: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
