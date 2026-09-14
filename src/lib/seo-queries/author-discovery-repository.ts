import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type {
  AuthorProposalQueryRow,
  AuthorProposalRepository,
  DiscoveryQueryRow,
  DiscoveryReservationRow,
} from "./author-discovery";
import { isEffectiveSeoReservation } from "./reservation-effective";

function mapQuery(row: {
  id: string;
  analysis_status: string;
  frequency: number | null;
  frequency_checked_at: string | null;
  source: string;
}): AuthorProposalQueryRow {
  return {
    id: row.id,
    analysisStatus: row.analysis_status,
    frequency: row.frequency,
    frequencyCheckedAt: row.frequency_checked_at,
    source: row.source,
  };
}

export function createAuthorProposalRepository(): AuthorProposalRepository {
  const supabase = createServiceRoleClient();
  return {
    async normalize(phrase) {
      const { data, error } = await supabase.rpc("normalize_seo_query", {
        p_query: phrase,
      });
      return error || typeof data !== "string" || !data ? null : data;
    },
    async findByNormalized(normalizedQuery) {
      const { data, error } = await supabase
        .from("seo_queries")
        .select("id, analysis_status, frequency, frequency_checked_at, source")
        .eq("normalized_query", normalizedQuery)
        .maybeSingle();
      if (error) return undefined;
      return data ? mapQuery(data) : null;
    },
    async createQuery(input) {
      const { data, error } = await supabase
        .from("seo_queries")
        .insert({
          query_text: input.queryText,
          source: input.source,
          frequency: input.frequency,
          frequency_checked_at: input.frequencyCheckedAt,
          analysis_status: input.analysisStatus,
        })
        .select("id, analysis_status, frequency, frequency_checked_at, source")
        .single();
      if (data && !error) {
        return { status: "created" as const, query: mapQuery(data) };
      }
      return error?.code === "23505"
        ? { status: "conflict" as const }
        : { status: "error" as const };
    },
    async findProposal(queryId, authorId) {
      const { data, error } = await supabase
        .from("seo_query_proposals")
        .select("id")
        .eq("query_id", queryId)
        .eq("author_id", authorId)
        .maybeSingle();
      if (error) return undefined;
      return data ? { id: data.id as string } : null;
    },
    async createProposal(input) {
      const { data, error } = await supabase
        .from("seo_query_proposals")
        .insert({
          query_id: input.queryId,
          author_id: input.authorId,
          submitted_by_user_id: input.submittedByUserId,
        })
        .select("id")
        .single();
      if (data && !error) {
        return { status: "created" as const, id: data.id as string };
      }
      return error?.code === "23505"
        ? { status: "conflict" as const }
        : { status: "error" as const };
    },
  };
}

export async function loadDiscoveryContextForPhrases(input: {
  authorId: string;
  phrases: string[];
}): Promise<{
  normalize: (phrase: string) => Promise<string | null>;
  queryByNormalized: Map<string, DiscoveryQueryRow>;
  reservationByQueryId: Map<string, DiscoveryReservationRow>;
  proposedQueryIds: Set<string>;
}> {
  const supabase = createServiceRoleClient();
  const normalizeCache = new Map<string, string | null>();

  async function normalize(phrase: string): Promise<string | null> {
    if (normalizeCache.has(phrase)) return normalizeCache.get(phrase) ?? null;
    const { data, error } = await supabase.rpc("normalize_seo_query", {
      p_query: phrase,
    });
    const value = error || typeof data !== "string" || !data ? null : data;
    normalizeCache.set(phrase, value);
    return value;
  }

  const normalizedList: string[] = [];
  for (const phrase of input.phrases) {
    const normalized = await normalize(phrase);
    if (normalized) normalizedList.push(normalized);
  }
  const uniqueNormalized = [...new Set(normalizedList)];

  const queryByNormalized = new Map<string, DiscoveryQueryRow>();
  if (uniqueNormalized.length > 0) {
    const { data: queries, error } = await supabase
      .from("seo_queries")
      .select("id, normalized_query, analysis_status")
      .in("normalized_query", uniqueNormalized);
    if (error) throw new Error("seo_discovery_queries_load_failed");
    for (const row of queries ?? []) {
      queryByNormalized.set(row.normalized_query as string, {
        id: row.id as string,
        analysisStatus: row.analysis_status as string,
      });
    }
  }

  const queryIds = [...queryByNormalized.values()].map((item) => item.id);
  const reservationByQueryId = new Map<string, DiscoveryReservationRow>();
  if (queryIds.length > 0) {
    await supabase.rpc("expire_seo_query_reservation", {
      p_author_id: input.authorId,
    });
    const { data: reservations, error } = await supabase
      .from("seo_query_reservations")
      .select("id, query_id, author_id, status, product_id, expires_at")
      .in("query_id", queryIds)
      .in("status", ["active", "used"]);
    if (error) throw new Error("seo_discovery_reservations_load_failed");

    const productIds = (reservations ?? [])
      .map((row) => row.product_id as string | null)
      .filter((id): id is string => Boolean(id));
    const productTitleById = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: products, error: productError } = await supabase
        .from("practices")
        .select("id, title")
        .in("id", productIds);
      if (productError) throw new Error("seo_discovery_products_load_failed");
      for (const product of products ?? []) {
        if (typeof product.title === "string") {
          productTitleById.set(product.id as string, product.title);
        }
      }
    }

    const now = new Date();
    for (const row of reservations ?? []) {
      const productId =
        typeof row.product_id === "string" ? row.product_id : null;
      const expiresAt =
        typeof row.expires_at === "string" ? row.expires_at : null;
      if (
        !isEffectiveSeoReservation(
          {
            status: row.status as string,
            productId,
            expiresAt,
          },
          now,
        )
      ) {
        continue;
      }
      reservationByQueryId.set(row.query_id as string, {
        id: row.id as string,
        queryId: row.query_id as string,
        authorId: row.author_id as string,
        status: row.status as string,
        productId,
        expiresAt,
        productTitle: productId ? productTitleById.get(productId) ?? null : null,
      });
    }
  }

  const proposedQueryIds = new Set<string>();
  if (queryIds.length > 0) {
    const { data: proposals, error } = await supabase
      .from("seo_query_proposals")
      .select("query_id")
      .eq("author_id", input.authorId)
      .in("query_id", queryIds);
    if (error) throw new Error("seo_discovery_proposals_load_failed");
    for (const row of proposals ?? []) {
      proposedQueryIds.add(row.query_id as string);
    }
  }

  return {
    normalize,
    queryByNormalized,
    reservationByQueryId,
    proposedQueryIds,
  };
}
