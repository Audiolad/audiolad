import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import { isEffectiveSeoReservation } from "@/lib/seo-queries/reservation-effective";

export type PublishedSeoQuerySearchMatch = {
  queryId: string;
  queryText: string;
  frequency: number | null;
  availability: "available" | "used_other" | "reserved_other" | "own_unlinked" | "linked_this";
  statusLabel: string;
  exactNormalizedMatch: boolean;
};

export type PublishedSeoAttachResult = {
  queryId: string;
  queryText: string;
  reservationId: string;
  status: "used";
  createdQuery: boolean;
  idempotent: boolean;
};

export function mapPublishedSeoAttachError(message: string): {
  code: string;
  status: number;
  message: string;
} {
  const code = message.trim();
  switch (code) {
    case "practice_not_found":
      return { code, status: 404, message: "Продукт не найден." };
    case "seo_attach_product_not_published":
      return {
        code,
        status: 409,
        message: "Закрепить запрос можно только у опубликованного продукта.",
      };
    case "practice_already_has_primary_seo_query":
      return {
        code,
        status: 409,
        message: "У этого продукта уже закреплён основной поисковый запрос.",
      };
    case "seo_query_not_found":
      return { code, status: 404, message: "Поисковый запрос не найден." };
    case "seo_query_already_used":
      return {
        code,
        status: 409,
        message: "Этот запрос уже закреплён за другим продуктом.",
      };
    case "seo_query_already_reserved":
      return {
        code,
        status: 409,
        message: "Этот запрос сейчас занят другим автором.",
      };
    case "seo_query_too_long_for_product":
      return {
        code,
        status: 409,
        message:
          "Этот поисковый запрос слишком длинный для основного запроса продукта.",
      };
    case "seo_query_empty":
    case "seo_query_required":
      return {
        code,
        status: 400,
        message: "Введите поисковый запрос.",
      };
    default:
      return {
        code: "seo_attach_failed",
        status: 500,
        message: "Не удалось закрепить поисковый запрос.",
      };
  }
}

export async function searchPublishedProductSeoQueries(
  supabase: SupabaseClient,
  input: {
    phrase: string;
    productId: string;
    authorId: string;
  },
): Promise<{
  phrase: string;
  normalized: string | null;
  exactNormalizedMatch: boolean;
  matches: PublishedSeoQuerySearchMatch[];
}> {
  const phrase = input.phrase.trim();
  if (!phrase) {
    return {
      phrase: "",
      normalized: null,
      exactNormalizedMatch: false,
      matches: [],
    };
  }

  const { data: normalizedRaw, error: normalizeError } = await supabase.rpc(
    "normalize_seo_query",
    { p_query: phrase },
  );
  if (normalizeError) {
    throw normalizeError;
  }
  const normalized =
    typeof normalizedRaw === "string" && normalizedRaw.trim()
      ? normalizedRaw.trim()
      : null;

  const selectCols =
    "id, query_text, normalized_query, frequency, analysis_status";
  let rows: Array<Record<string, unknown>> = [];

  if (normalized) {
    const safe = normalized.replace(/[%_]/g, " ");
    // Exact match ignores analysis_status; fuzzy recommendations stay analyzed-only.
    const [{ data: exactRows, error: exactError }, { data: fuzzyRows, error: fuzzyError }] =
      await Promise.all([
        supabase
          .from("seo_queries")
          .select(selectCols)
          .eq("normalized_query", normalized)
          .limit(5),
        supabase
          .from("seo_queries")
          .select(selectCols)
          .eq("analysis_status", "analyzed")
          .ilike("normalized_query", `%${safe}%`)
          .order("frequency", { ascending: false, nullsFirst: false })
          .limit(20),
      ]);
    if (exactError) throw exactError;
    if (fuzzyError) throw fuzzyError;
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of [...(exactRows ?? []), ...(fuzzyRows ?? [])]) {
      byId.set(row.id as string, row as Record<string, unknown>);
    }
    rows = [...byId.values()];
  } else {
    const { data, error } = await supabase
      .from("seo_queries")
      .select(selectCols)
      .eq("analysis_status", "analyzed")
      .ilike("query_text", `%${phrase}%`)
      .order("frequency", { ascending: false, nullsFirst: false })
      .limit(20);
    if (error) throw error;
    rows = (data ?? []) as Array<Record<string, unknown>>;
  }

  const queryIds = (rows ?? []).map((row) => row.id as string);
  const reservationByQueryId = new Map<
    string,
    {
      status: string;
      authorId: string;
      productId: string | null;
      expiresAt: string | null;
    }
  >();

  if (queryIds.length > 0) {
    const { data: reservations, error: reservationError } = await supabase
      .from("seo_query_reservations")
      .select("query_id, status, author_id, product_id, expires_at")
      .in("query_id", queryIds)
      .in("status", ["active", "used"]);
    if (reservationError) throw reservationError;
    for (const row of reservations ?? []) {
      reservationByQueryId.set(row.query_id as string, {
        status: row.status as string,
        authorId: row.author_id as string,
        productId: (row.product_id as string | null) ?? null,
        expiresAt: (row.expires_at as string | null) ?? null,
      });
    }
  }

  const matches: PublishedSeoQuerySearchMatch[] = [];
  let exactNormalizedMatch = false;

  for (const row of rows ?? []) {
    const queryId = row.id as string;
    const queryText = row.query_text as string;
    const rowNormalized = row.normalized_query as string;
    const exact = Boolean(normalized && rowNormalized === normalized);
    if (exact) exactNormalizedMatch = true;

    const reservation = reservationByQueryId.get(queryId) ?? null;
    let availability: PublishedSeoQuerySearchMatch["availability"] =
      "available";
    let statusLabel = "Свободен";

    const effective = reservation
      ? isEffectiveSeoReservation({
          status: reservation.status,
          productId: reservation.productId,
          expiresAt: reservation.expiresAt,
        })
      : false;

    if (effective && reservation?.status === "used") {
      if (reservation.productId === input.productId) {
        availability = "linked_this";
        statusLabel = "Закреплён за этим продуктом";
      } else {
        availability = "used_other";
        statusLabel = "Уже используется";
      }
    } else if (effective && reservation?.status === "active") {
      if (reservation.authorId === input.authorId && !reservation.productId) {
        availability = "own_unlinked";
        statusLabel = "У вас в работе";
      } else if (reservation.authorId !== input.authorId) {
        availability = "reserved_other";
        statusLabel = "Уже используется";
      } else if (
        reservation.productId &&
        reservation.productId !== input.productId
      ) {
        availability = "reserved_other";
        statusLabel = "Уже используется";
      } else {
        availability = "own_unlinked";
        statusLabel = "У вас в работе";
      }
    }
    // Expired active + product_id NULL → treat as available (matches expire semantics).

    matches.push({
      queryId,
      queryText,
      frequency:
        typeof row.frequency === "number" ? (row.frequency as number) : null,
      availability,
      statusLabel,
      exactNormalizedMatch: exact,
    });
  }

  // Prefer exact match first.
  matches.sort((a, b) => Number(b.exactNormalizedMatch) - Number(a.exactNormalizedMatch));

  return {
    phrase,
    normalized,
    exactNormalizedMatch,
    matches,
  };
}

export async function attachPublishedProductSeoQuery(
  service: SupabaseClient,
  input: {
    productId: string;
    queryId?: string | null;
    queryText?: string | null;
  },
): Promise<PublishedSeoAttachResult> {
  const { data, error } = await service.rpc(
    "attach_published_seo_query_to_product",
    {
      p_product_id: input.productId,
      p_query_id: input.queryId?.trim() || null,
      p_query_text: input.queryId ? null : input.queryText?.trim() || null,
    },
  );

  if (error) {
    const mapped = mapPublishedSeoAttachError(error.message ?? "");
    const err = new Error(mapped.message) as Error & {
      code: string;
      status: number;
    };
    err.code = mapped.code;
    err.status = mapped.status;
    throw err;
  }

  const payload = data as {
    query_id?: string;
    query_text?: string;
    reservation_id?: string;
    status?: string;
    created_query?: boolean;
    idempotent?: boolean;
  };

  if (
    !payload?.query_id ||
    !payload.query_text ||
    !payload.reservation_id ||
    payload.status !== "used"
  ) {
    throw Object.assign(new Error("seo_attach_failed"), {
      code: "seo_attach_failed",
      status: 500,
    });
  }

  if (payload.query_text.length > PRODUCT_CONTENT_LIMITS.seoPrimaryQuery) {
    throw Object.assign(new Error("seo_query_too_long_for_product"), {
      code: "seo_query_too_long_for_product",
      status: 409,
    });
  }

  return {
    queryId: payload.query_id,
    queryText: payload.query_text,
    reservationId: payload.reservation_id,
    status: "used",
    createdQuery: Boolean(payload.created_query),
    idempotent: Boolean(payload.idempotent),
  };
}
