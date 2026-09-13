import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { SeoQueryLifecycle, SeoQueryOpportunity } from "./types";

type ReservationRow = {
  id: string;
  query_id: string;
  author_id: string;
  product_id: string | null;
  expires_at: string | null;
  status: string;
};

function lifecycleFor(
  reservation: ReservationRow | undefined,
  product: { status?: string | null; moderation_status?: string | null } | undefined,
): SeoQueryLifecycle {
  if (!reservation) return "available";
  if (reservation.status === "used" || product?.status === "published") return "published";
  if (product?.moderation_status === "submitted") return "moderation";
  return "in_progress";
}

/** Uses the server-only client after the page has verified author membership. */
export async function listSeoOpportunitiesForAuthor(authorId: string): Promise<SeoQueryOpportunity[]> {
  const supabase = createServiceRoleClient();
  await supabase.rpc("expire_seo_query_reservation", { p_author_id: authorId });

  const [{ data: queries, error: queryError }, { data: reservations, error: reservationError }] =
    await Promise.all([
      supabase
        .from("seo_queries")
        .select("id, query_text, normalized_query, source, frequency, intent, recommended_format, audio_fit, seo_clusters(name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("seo_query_reservations")
        .select("id, query_id, author_id, product_id, expires_at, status")
        .in("status", ["active", "used"]),
    ]);

  if (queryError || reservationError) {
    throw new Error("seo_queries_load_failed");
  }

  const allReservations = (reservations ?? []) as ReservationRow[];
  const productIds = allReservations
    .map((item) => item.product_id)
    .filter((id): id is string => Boolean(id));
  const { data: products, error: productError } = productIds.length
    ? await supabase
        .from("practices")
        .select("id, title, status, moderation_status")
        .in("id", productIds)
    : { data: [], error: null };
  if (productError) throw new Error("seo_query_products_load_failed");

  const reservationByQuery = new Map(allReservations.map((item) => [item.query_id, item]));
  const productById = new Map((products ?? []).map((item) => [item.id as string, item]));

  return (queries ?? []).map((row) => {
    const reservation = reservationByQuery.get(row.id as string);
    const product = reservation?.product_id
      ? productById.get(reservation.product_id)
      : undefined;
    const cluster = Array.isArray(row.seo_clusters) ? row.seo_clusters[0] : row.seo_clusters;

    return {
      id: row.id as string,
      queryText: row.query_text as string,
      normalizedQuery: row.normalized_query as string,
      source: row.source as string,
      frequency: typeof row.frequency === "number" ? row.frequency : null,
      clusterName: typeof cluster?.name === "string" ? cluster.name : null,
      intent: typeof row.intent === "string" ? row.intent : null,
      recommendedFormat:
        typeof row.recommended_format === "string" ? row.recommended_format : null,
      audioFit: typeof row.audio_fit === "string" ? row.audio_fit : null,
      lifecycle: lifecycleFor(reservation, product),
      reservationId: reservation?.author_id === authorId ? reservation.id : null,
      expiresAt: reservation?.author_id === authorId ? reservation.expires_at : null,
      productId: reservation?.author_id === authorId ? reservation.product_id : null,
      productTitle:
        reservation?.author_id === authorId && typeof product?.title === "string"
          ? product.title
          : null,
    };
  });
}
