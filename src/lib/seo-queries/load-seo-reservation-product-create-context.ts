import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import { isMusicCreateSeoDiscoveryEnabled } from "@/lib/seo-queries/discovery-beta";
import type { SeoReservationProductFormContext } from "@/lib/seo-queries/seo-reservation-product-context";

export type SeoReservationProductCreateContext = SeoReservationProductFormContext;

export type SeoReservationProductCreateLoadResult =
  | { ok: true; context: SeoReservationProductCreateContext }
  | {
      ok: false;
      code:
        | "missing"
        | "not_found"
        | "forbidden"
        | "beta_disabled"
        | "inactive"
        | "expired"
        | "already_linked"
        | "query_missing"
        | "query_too_long";
      message: string;
    };

const INACTIVE_MESSAGE =
  "Бронирование поискового запроса больше не активно.";

/**
 * Server-only trusted reservation context for product create.
 * Never trusts query text / query id from the client URL.
 */
export async function loadSeoReservationProductCreateContext(
  supabase: SupabaseClient,
  input: {
    reservationId: string | null | undefined;
    authorId: string;
    publicationClass?: string | null;
  },
): Promise<SeoReservationProductCreateLoadResult> {
  const reservationId =
    typeof input.reservationId === "string" ? input.reservationId.trim() : "";

  if (!reservationId) {
    return {
      ok: false,
      code: "missing",
      message: INACTIVE_MESSAGE,
    };
  }

  if (
    !isMusicCreateSeoDiscoveryEnabled({
      authorId: input.authorId,
      publicationClass: input.publicationClass,
    })
  ) {
    return {
      ok: false,
      code: "beta_disabled",
      message: "Эта функция пока доступна только в закрытой бете.",
    };
  }

  const { data: reservation, error } = await supabase
    .from("seo_query_reservations")
    .select("id, query_id, author_id, status, expires_at, product_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (error) {
    console.error("seo_reservation_create_context_error", error.message);
    return {
      ok: false,
      code: "not_found",
      message: INACTIVE_MESSAGE,
    };
  }

  if (!reservation) {
    return {
      ok: false,
      code: "not_found",
      message: INACTIVE_MESSAGE,
    };
  }

  if (reservation.author_id !== input.authorId) {
    return {
      ok: false,
      code: "forbidden",
      message: INACTIVE_MESSAGE,
    };
  }

  if (reservation.status !== "active") {
    return {
      ok: false,
      code: "inactive",
      message: INACTIVE_MESSAGE,
    };
  }

  const expiresAt =
    typeof reservation.expires_at === "string" ? reservation.expires_at : null;
  const productId =
    typeof reservation.product_id === "string" ? reservation.product_id : null;

  if (
    !productId &&
    expiresAt &&
    Number.isFinite(Date.parse(expiresAt)) &&
    Date.parse(expiresAt) < Date.now()
  ) {
    return {
      ok: false,
      code: "expired",
      message: INACTIVE_MESSAGE,
    };
  }

  // Already linked to another product — cannot start a new create flow.
  if (productId) {
    return {
      ok: false,
      code: "already_linked",
      message:
        "Этот поисковый запрос уже связан с другим продуктом.",
    };
  }

  const { data: query, error: queryError } = await supabase
    .from("seo_queries")
    .select("id, query_text")
    .eq("id", reservation.query_id)
    .maybeSingle();

  if (queryError || !query?.id || typeof query.query_text !== "string") {
    return {
      ok: false,
      code: "query_missing",
      message: INACTIVE_MESSAGE,
    };
  }

  const queryText = query.query_text.trim();
  if (!queryText) {
    return {
      ok: false,
      code: "query_missing",
      message: INACTIVE_MESSAGE,
    };
  }

  if (queryText.length > PRODUCT_CONTENT_LIMITS.seoPrimaryQuery) {
    return {
      ok: false,
      code: "query_too_long",
      message:
        "Этот поисковый запрос слишком длинный для основного запроса продукта.",
    };
  }

  return {
    ok: true,
    context: {
      reservationId: reservation.id,
      queryId: query.id,
      queryText,
      expiresAt,
      linked: false,
    },
  };
}
