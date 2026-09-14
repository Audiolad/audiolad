import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type {
  AuthorProposalQueryRow,
  AuthorProposalRepository,
  DiscoveryQueryRow,
  DiscoveryReservationRow,
} from "./author-discovery";
import { isEffectiveSeoReservation } from "./reservation-effective";
import { classifySeoQuery } from "./classifier";
import {
  rankAnalyzedQueriesForSeed,
  tokenizeSeoPhrase,
  type RankableSeoQuery,
} from "./discovery-ranking";


/** PostgREST GET `.in()` with many long Cyrillic values can 502 via edge nginx. */
export const SEO_DISCOVERY_IN_CHUNK_SIZE = 8;

export function chunkList<T>(items: T[], size: number = SEO_DISCOVERY_IN_CHUNK_SIZE): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

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
    for (const batch of chunkList(uniqueNormalized)) {
      if (batch.length === 0) continue;
      const { data: queries, error } = await supabase
        .from("seo_queries")
        .select("id, normalized_query, analysis_status")
        .in("normalized_query", batch);
      if (error) throw new Error("seo_discovery_queries_load_failed");
      for (const row of queries ?? []) {
        queryByNormalized.set(row.normalized_query as string, {
          id: row.id as string,
          analysisStatus: row.analysis_status as string,
        });
      }
    }
  }

  const queryIds = [...queryByNormalized.values()].map((item) => item.id);
  const reservationByQueryId = new Map<string, DiscoveryReservationRow>();
  if (queryIds.length > 0) {
    await supabase.rpc("expire_seo_query_reservation", {
      p_author_id: input.authorId,
    });
    const reservations: Array<{
      id: string;
      query_id: string;
      author_id: string;
      status: string;
      product_id: string | null;
      expires_at: string | null;
    }> = [];
    for (const batch of chunkList(queryIds)) {
      if (batch.length === 0) continue;
      const { data, error } = await supabase
        .from("seo_query_reservations")
        .select("id, query_id, author_id, status, product_id, expires_at")
        .in("query_id", batch)
        .in("status", ["active", "used"]);
      if (error) throw new Error("seo_discovery_reservations_load_failed");
      for (const row of data ?? []) {
        reservations.push({
          id: row.id as string,
          query_id: row.query_id as string,
          author_id: row.author_id as string,
          status: row.status as string,
          product_id: (row.product_id as string | null) ?? null,
          expires_at: (row.expires_at as string | null) ?? null,
        });
      }
    }

    const productIds = reservations
      .map((row) => row.product_id)
      .filter((id): id is string => Boolean(id));
    const productTitleById = new Map<string, string>();
    if (productIds.length > 0) {
      for (const batch of chunkList([...new Set(productIds)])) {
        if (batch.length === 0) continue;
        const { data: products, error: productError } = await supabase
          .from("practices")
          .select("id, title")
          .in("id", batch);
        if (productError) throw new Error("seo_discovery_products_load_failed");
        for (const product of products ?? []) {
          if (typeof product.title === "string") {
            productTitleById.set(product.id as string, product.title);
          }
        }
      }
    }

    const now = new Date();
    for (const row of reservations) {
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
    for (const batch of chunkList(queryIds)) {
      if (batch.length === 0) continue;
      const { data: proposals, error } = await supabase
        .from("seo_query_proposals")
        .select("query_id")
        .eq("author_id", input.authorId)
        .in("query_id", batch);
      if (error) throw new Error("seo_discovery_proposals_load_failed");
      for (const row of proposals ?? []) {
        proposedQueryIds.add(row.query_id as string);
      }
    }
  }

  return {
    normalize,
    queryByNormalized,
    reservationByQueryId,
    proposedQueryIds,
  };
}

const ANALYZED_CANDIDATE_LIMIT = 250;

/**
 * Load analyzed SEO queries relevant to a seed without a full-table scan when possible:
 * exact normalized match + token ILIKE filters, then deterministic in-memory ranking.
 */
export async function loadRankedAnalyzedQueriesForSeed(input: {
  authorId: string;
  seedPhrase: string;
}): Promise<{
  seedNormalized: string | null;
  matches: Array<
    RankableSeoQuery & {
      score: number;
      reasons: string[];
      reservation: DiscoveryReservationRow | null;
    }
  >;
}> {
  const supabase = createServiceRoleClient();
  const { data: normalizedRaw, error: normalizeError } = await supabase.rpc(
    "normalize_seo_query",
    { p_query: input.seedPhrase },
  );
  const seedNormalized =
    !normalizeError && typeof normalizedRaw === "string" && normalizedRaw
      ? normalizedRaw
      : null;

  const tokens = tokenizeSeoPhrase(seedNormalized || input.seedPhrase);
  const candidates = new Map<string, RankableSeoQuery>();

  async function ingestRows(rows: Array<Record<string, unknown>> | null) {
    for (const row of rows ?? []) {
      const id = row.id as string;
      if (!id || candidates.has(id)) continue;
      const cluster = Array.isArray(row.seo_clusters)
        ? row.seo_clusters[0]
        : row.seo_clusters;
      candidates.set(id, {
        id,
        queryText: row.query_text as string,
        normalizedQuery: row.normalized_query as string,
        frequency: typeof row.frequency === "number" ? row.frequency : null,
        intent: typeof row.intent === "string" ? row.intent : null,
        recommendedFormat:
          typeof row.recommended_format === "string"
            ? row.recommended_format
            : null,
        audioFit: typeof row.audio_fit === "string" ? row.audio_fit : null,
        clusterName:
          cluster && typeof (cluster as { name?: string }).name === "string"
            ? (cluster as { name: string }).name
            : null,
        analysisStatus: row.analysis_status as string,
      });
    }
  }

  if (seedNormalized) {
    const { data, error } = await supabase
      .from("seo_queries")
      .select(
        "id, query_text, normalized_query, frequency, intent, recommended_format, audio_fit, analysis_status, seo_clusters(name)",
      )
      .eq("analysis_status", "analyzed")
      .eq("normalized_query", seedNormalized)
      .limit(5);
    if (error) throw new Error("seo_discovery_analyzed_exact_load_failed");
    await ingestRows(data as Array<Record<string, unknown>> | null);
  }

  for (const batch of chunkList(tokens, 4)) {
    if (batch.length === 0) continue;
    const orFilter = batch
      .map((token) => {
        const safe = token.replace(/[%(),]/g, "");
        return safe ? `normalized_query.ilike.%${safe}%` : "";
      })
      .filter(Boolean)
      .join(",");
    if (!orFilter) continue;
    const { data, error } = await supabase
      .from("seo_queries")
      .select(
        "id, query_text, normalized_query, frequency, intent, recommended_format, audio_fit, analysis_status, seo_clusters(name)",
      )
      .eq("analysis_status", "analyzed")
      .or(orFilter)
      .limit(ANALYZED_CANDIDATE_LIMIT);
    if (error) throw new Error("seo_discovery_analyzed_token_load_failed");
    await ingestRows(data as Array<Record<string, unknown>> | null);
    if (candidates.size >= ANALYZED_CANDIDATE_LIMIT) break;
  }

  if (candidates.size === 0) {
    const { data, error } = await supabase
      .from("seo_queries")
      .select(
        "id, query_text, normalized_query, frequency, intent, recommended_format, audio_fit, analysis_status, seo_clusters(name)",
      )
      .eq("analysis_status", "analyzed")
      .order("frequency", { ascending: false })
      .limit(80);
    if (error) throw new Error("seo_discovery_analyzed_fallback_load_failed");
    await ingestRows(data as Array<Record<string, unknown>> | null);
  }

  const seedClass = classifySeoQuery({ queryText: input.seedPhrase });
  const ranked = rankAnalyzedQueriesForSeed({
    seedPhrase: input.seedPhrase,
    seedNormalized,
    queries: [...candidates.values()],
    seedIntentHint: seedClass.intent,
    seedFormatHint: seedClass.recommendedFormat,
  });

  const queryIds = ranked.map((item) => item.id);
  const reservationByQueryId = new Map<string, DiscoveryReservationRow>();
  if (queryIds.length > 0) {
    await supabase.rpc("expire_seo_query_reservation", {
      p_author_id: input.authorId,
    });
    for (const batch of chunkList(queryIds)) {
      if (batch.length === 0) continue;
      const { data: reservations, error } = await supabase
        .from("seo_query_reservations")
        .select("id, query_id, author_id, status, product_id, expires_at")
        .in("query_id", batch)
        .in("status", ["active", "used"]);
      if (error) throw new Error("seo_discovery_reservations_load_failed");
      const productIds = (reservations ?? [])
        .map((row) => row.product_id as string | null)
        .filter((id): id is string => Boolean(id));
      const productTitleById = new Map<string, string>();
      if (productIds.length > 0) {
        for (const productBatch of chunkList([...new Set(productIds)])) {
          const { data: products, error: productError } = await supabase
            .from("practices")
            .select("id, title")
            .in("id", productBatch);
          if (productError) throw new Error("seo_discovery_products_load_failed");
          for (const product of products ?? []) {
            if (typeof product.title === "string") {
              productTitleById.set(product.id as string, product.title);
            }
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
            { status: row.status as string, productId, expiresAt },
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
          productTitle: productId
            ? productTitleById.get(productId) ?? null
            : null,
        });
      }
    }
  }

  return {
    seedNormalized,
    matches: ranked.map((item) => ({
      ...item,
      reservation: reservationByQueryId.get(item.id) ?? null,
    })),
  };
}
