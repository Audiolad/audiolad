import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";

function readString(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function mapReservationError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("seo_query_already_reserved")) {
    return { error: "seo_query_already_reserved", message: "Этот запрос уже взял другой автор. Выберите другой.", status: 409 };
  }
  if (message.includes("seo_reservation_limit_reached")) {
    return { error: "seo_reservation_limit_reached", message: "У вас уже 5 запросов в работе. Завершите или освободите один из них.", status: 409 };
  }
  if (message.includes("seo_reservation_product_lifecycle_locked")) {
    return { error: "seo_reservation_product_lifecycle_locked", message: "Запрос нельзя освободить после отправки продукта на модерацию или публикации.", status: 409 };
  }
  if (message.includes("seo_reservation_product_not_linkable")) {
    return { error: "seo_reservation_product_not_linkable", message: "Связать запрос можно только с черновиком до отправки на модерацию.", status: 409 };
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const authorId = readString(body, "author_id");
    const queryId = readString(body, "query_id");
    if (!authorId || !queryId) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

    const { supabase } = await requireAuthorMutationMembership(authorId);
    const { data, error } = await supabase.rpc("reserve_seo_query", {
      p_query_id: queryId,
      p_author_id: authorId,
    });
    if (error) {
      const mapped = mapReservationError(error);
      return NextResponse.json(mapped ?? { error: "seo_reservation_failed" }, { status: mapped?.status ?? 400 });
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
    if (!authorId || !reservationId) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

    const { supabase } = await requireAuthorMutationMembership(authorId);
    const { data, error } = await supabase.rpc("release_seo_query_reservation", {
      p_reservation_id: reservationId,
    });
    if (error) {
      const mapped = mapReservationError(error);
      return NextResponse.json(mapped ?? { error: "seo_reservation_release_failed" }, { status: mapped?.status ?? 400 });
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
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMutationMembership(authorId);
    const { data, error } = await supabase.rpc("link_seo_reservation_to_product", {
      p_reservation_id: reservationId,
      p_product_id: productId,
    });
    if (error) {
      const mapped = mapReservationError(error);
      return NextResponse.json(mapped ?? { error: "seo_reservation_link_failed" }, { status: mapped?.status ?? 400 });
    }
    return NextResponse.json({ reservation: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
