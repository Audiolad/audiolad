import AdminSeoQueriesClient from "@/components/admin/AdminSeoQueriesClient";
import { requireAdminPermission } from "@/lib/admin/guard";
import { isEffectiveSeoReservation } from "@/lib/seo-queries/reservation-effective";
import { lifecycleLabel, type SeoQueryLifecycle } from "@/lib/seo-queries/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export default async function AdminSeoQueriesPage() {
  await requireAdminPermission("seo.manage");
  const supabase = createServiceRoleClient();
  await supabase.rpc("expire_seo_query_reservation", {});
  const [
    { data: queries },
    { data: reservations },
    { data: clusters },
    { data: proposals },
  ] = await Promise.all([
    supabase
      .from("seo_queries")
      .select(
        "id, query_text, normalized_query, source, frequency, intent, recommended_format, audio_fit, analysis_status, created_at, seo_clusters(id, name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("seo_query_reservations")
      .select(
        "id, query_id, author_id, product_id, reserved_at, expires_at, status, authors(name), practices(title, status, moderation_status)",
      )
      .in("status", ["active", "used"]),
    supabase.from("seo_clusters").select("id, name").order("name"),
    supabase
      .from("seo_query_proposals")
      .select(
        "id, query_id, author_id, submitted_by_user_id, created_at, authors(name, slug)",
      )
      .order("created_at", { ascending: false }),
  ]);

  const reservationByQuery = new Map(
    (reservations ?? []).map((item) => [item.query_id as string, item]),
  );
  const proposalByQuery = new Map<string, NonNullable<typeof proposals>[number]>();
  for (const proposal of proposals ?? []) {
    const queryId = proposal.query_id as string;
    if (!proposalByQuery.has(queryId)) {
      proposalByQuery.set(queryId, proposal);
    }
  }

  const rows = (queries ?? []).map((item) => {
    const reservation = reservationByQuery.get(item.id as string);
    const proposal = proposalByQuery.get(item.id as string);
    const product = Array.isArray(reservation?.practices)
      ? reservation?.practices[0]
      : reservation?.practices;
    const author = Array.isArray(reservation?.authors)
      ? reservation?.authors[0]
      : reservation?.authors;
    const proposalAuthor = Array.isArray(proposal?.authors)
      ? proposal?.authors[0]
      : proposal?.authors;
    const effectiveReservation = reservation
      ? isEffectiveSeoReservation({
          status: reservation.status as string,
          productId: (reservation.product_id as string | null) ?? null,
          expiresAt: (reservation.expires_at as string | null) ?? null,
        })
      : false;
    const lifecycle: SeoQueryLifecycle =
      reservation?.status === "used"
        ? "published"
        : product?.status === "published"
          ? "published"
          : product?.moderation_status === "submitted"
            ? "moderation"
            : effectiveReservation
              ? "in_progress"
              : "available";
    const cluster = Array.isArray(item.seo_clusters)
      ? item.seo_clusters[0]
      : item.seo_clusters;
    const analysisStatus = item.analysis_status as
      | "not_analyzed"
      | "analyzed"
      | "not_applicable";
    const proposedByAuthor = Boolean(proposal);
    const needsReview =
      proposedByAuthor && analysisStatus === "not_analyzed";
    const approvedUnreserved =
      proposedByAuthor &&
      analysisStatus === "analyzed" &&
      !effectiveReservation;

    return {
      id: item.id as string,
      queryText: item.query_text as string,
      normalizedQuery: item.normalized_query as string,
      source: item.source as string,
      frequency: typeof item.frequency === "number" ? item.frequency : null,
      cluster: typeof cluster?.name === "string" ? cluster.name : null,
      clusterId: typeof cluster?.id === "string" ? cluster.id : null,
      intent: item.intent as string | null,
      recommendedFormat: item.recommended_format as string | null,
      audioFit: item.audio_fit as string | null,
      analysisStatus,
      lifecycle: lifecycleLabel(lifecycle),
      author: (author?.name as string | null) ?? null,
      product: (product?.title as string | null) ?? null,
      reservedAt: (reservation?.reserved_at as string | null) ?? null,
      expiresAt: (reservation?.expires_at as string | null) ?? null,
      createdAt: item.created_at as string,
      reservationId: (reservation?.id as string | null) ?? null,
      proposalId: (proposal?.id as string | null) ?? null,
      proposalAuthorId: (proposal?.author_id as string | null) ?? null,
      proposalAuthorName: (proposalAuthor?.name as string | null) ?? null,
      proposalAuthorSlug: (proposalAuthor?.slug as string | null) ?? null,
      proposalCreatedAt: (proposal?.created_at as string | null) ?? null,
      proposedByAuthor,
      needsReview,
      approvedUnreserved,
    };
  });

  rows.sort((a, b) => {
    if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
    if (a.approvedUnreserved !== b.approvedUnreserved) {
      return a.approvedUnreserved ? -1 : 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <section>
      <h2 className="text-[21px] font-semibold">SEO-запросы</h2>
      <p className="mt-2 text-sm text-[#796ba0]">
        Ручное управление поисковыми запросами и их резервированием авторами.
      </p>
      <div className="mt-5">
        <AdminSeoQueriesClient
          initialRows={rows}
          clusters={(clusters ?? []).map((item) => ({
            id: item.id as string,
            name: item.name as string,
          }))}
        />
      </div>
    </section>
  );
}
