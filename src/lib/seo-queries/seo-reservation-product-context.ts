/** Trusted SEO reservation context passed from server pages into AuthorProductForm. */

export type SeoReservationProductFormContext = {
  reservationId: string;
  queryId: string;
  queryText: string;
  expiresAt: string | null;
  /** True when practices.primary_seo_query_id already matches queryId. */
  linked: boolean;
};

export function mapSeoReservationLinkError(code: string | null | undefined): {
  code: string;
  message: string;
} {
  switch (code) {
    case "seo_reservation_expired":
      return {
        code,
        message: "Бронирование поискового запроса истекло.",
      };
    case "seo_reservation_already_linked":
      return {
        code,
        message: "Этот поисковый запрос уже связан с другим продуктом.",
      };
    case "practice_already_has_primary_seo_query":
      return {
        code,
        message: "У продукта уже есть другой основной поисковый запрос.",
      };
    case "seo_query_too_long_for_product":
      return {
        code,
        message:
          "Этот поисковый запрос слишком длинный для основного запроса продукта.",
      };
    case "seo_reservation_product_not_linkable":
      return {
        code,
        message:
          "Связать запрос можно только с черновиком до отправки на модерацию.",
      };
    case "seo_reservation_product_not_music":
      return {
        code,
        message: "Связать запрос можно только с музыкальным продуктом.",
      };
    case "seo_reservation_not_linkable":
      return {
        code,
        message: "Бронирование поискового запроса больше не активно.",
      };
    case "forbidden":
      return {
        code,
        message: "Недостаточно прав, чтобы связать этот поисковый запрос.",
      };
    default:
      return {
        code: code || "seo_reservation_link_failed",
        message:
          "Черновик создан, но поисковый запрос не удалось связать с продуктом. Попробуйте сохранить ещё раз.",
      };
  }
}

export async function linkSeoReservationToProduct(input: {
  authorId: string;
  reservationId: string;
  productId: string;
  publicationClass?: string | null;
}): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const response = await fetch("/api/author/seo-reservations", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      author_id: input.authorId,
      reservation_id: input.reservationId,
      product_id: input.productId,
      ...(input.publicationClass
        ? { publication_class: input.publicationClass }
        : {}),
    }),
  });

  let payload: { error?: string; message?: string } = {};
  try {
    payload = (await response.json()) as { error?: string; message?: string };
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const mapped = mapSeoReservationLinkError(payload.error);
    return {
      ok: false,
      code: mapped.code,
      message: payload.message?.trim() || mapped.message,
    };
  }

  return { ok: true };
}
