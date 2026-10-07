import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type {
  AuthorProposalQueryRow,
  AuthorProposalRepository,
  DiscoveryQueryRow,
  DiscoveryReservationRow,
} from "./author-discovery";
import { loadPublishedSeoOccupancyForQueries } from "./load-published-seo-occupancy";
import {
  normalizeSeoQueryText,
  toPublishedSeoQueryOccupancy,
  type PublishedSeoQueryOccupancy,
  type SeoOccupancyHit,
} from "./published-query-occupancy";
import { isEffectiveSeoReservation } from "./reservation-effective";
import { classifySeoQuery } from "./classifier";
import {
  AUTHOR_SEO_DISCOVERY_SURFACES,
  isHiddenFromProductCreateDiscovery,
  takeRankedDiscoveryItemsUntilVisible,
  type AuthorSeoDiscoverySurface,
} from "./author-discovery-status";
import {
  rankAnalyzedQueriesForSeed,
  tokenizeSeoPhrase,
  type RankableSeoQuery,
  SEO_DISCOVERY_DATABASE_CANDIDATE_LIMIT,
  SEO_DISCOVERY_DATABASE_LIMIT,
} from "./discovery-ranking";


/** PostgREST GET `.in()` with many long Cyrillic values can 502 via edge nginx. */
export const SEO_DISCOVERY_IN_CHUNK_SIZE = 8;

/**
 * Encoded value budget for one `.in()` query string, leaving room for the
 * rest of the PostgREST URL under a typical 8 KB nginx header buffer.
 */
export const SEO_DISCOVERY_IN_ENCODED_BUDGET = 1800;

export function chunkList<T>(items: T[], size: number = SEO_DISCOVERY_IN_CHUNK_SIZE): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

export function encodedInFilterCost(value: string): number {
  return encodeURIComponent(value).length + 1;
}

/** Count cap plus encoded-length cap so long Cyrillic phrases stay request-sized. */
export function chunkListByEncodedBudget(
  items: string[],
  maxItems: number = SEO_DISCOVERY_IN_CHUNK_SIZE,
  maxEncoded: number = SEO_DISCOVERY_IN_ENCODED_BUDGET,
): string[][] {
  if (items.length === 0) return [[]];
  const limit = maxItems > 0 ? maxItems : SEO_DISCOVERY_IN_CHUNK_SIZE;
  const budget = maxEncoded > 0 ? maxEncoded : SEO_DISCOVERY_IN_ENCODED_BUDGET;
  const chunks: string[][] = [];
  let current: string[] = [];
  let encoded = 0;
  for (const item of items) {
    const cost = encodedInFilterCost(item);
    if (
      current.length > 0 &&
      (current.length >= limit || encoded + cost > budget)
    ) {
      chunks.push(current);
      current = [];
      encoded = 0;
    }
    current.push(item);
    encoded += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
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

type DiscoveryReadClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  // Query builders are chained; tests supply a fake and production supplies Supabase.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type DiscoveryContextStage =
  | "seo_discovery_normalize_failed"
  | "seo_discovery_queries_load_failed"
  | "seo_discovery_reservations_load_failed"
  | "seo_discovery_products_load_failed"
  | "seo_discovery_proposals_load_failed";

export type DiscoveryPhraseContext = {
  normalize: (phrase: string) => Promise<string | null>;
  queryByNormalized: Map<string, DiscoveryQueryRow>;
  reservationByQueryId: Map<string, DiscoveryReservationRow>;
  proposedQueryIds: Set<string>;
  failedStage: DiscoveryContextStage | null;
};

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function loadDiscoveryContextForPhrases(input: {
  authorId: string;
  phrases: string[];
  supabase?: DiscoveryReadClient;
}): Promise<DiscoveryPhraseContext> {
  const supabase = input.supabase ?? createServiceRoleClient();
  const normalizeCache = new Map<string, string | null>();
  let normalizeFailures = 0;

  async function normalize(phrase: string): Promise<string | null> {
    if (normalizeCache.has(phrase)) return normalizeCache.get(phrase) ?? null;
    const { data, error } = await supabase.rpc("normalize_seo_query", {
      p_query: phrase,
    });
    let value = error || typeof data !== "string" || !data ? null : data;
    if (!value) {
      const mirrored = normalizeSeoQueryText(phrase);
      value = mirrored || null;
      if (!value) normalizeFailures += 1;
    }
    normalizeCache.set(phrase, value);
    return value;
  }

  await mapWithConcurrency(input.phrases, SEO_DISCOVERY_IN_CHUNK_SIZE, (phrase) =>
    normalize(phrase),
  );
  const normalizedList: string[] = [];
  for (const phrase of input.phrases) {
    const normalized = normalizeCache.get(phrase) ?? null;
    if (normalized) normalizedList.push(normalized);
  }
  const uniqueNormalized = [...new Set(normalizedList)];

  const queryByNormalized = new Map<string, DiscoveryQueryRow>();
  const reservationByQueryId = new Map<string, DiscoveryReservationRow>();
  const proposedQueryIds = new Set<string>();

  if (
    input.phrases.length > 0 &&
    normalizeFailures === input.phrases.length &&
    uniqueNormalized.length === 0
  ) {
    return {
      normalize,
      queryByNormalized,
      reservationByQueryId,
      proposedQueryIds,
      failedStage: "seo_discovery_normalize_failed",
    };
  }

  if (uniqueNormalized.length > 0) {
    for (const batch of chunkListByEncodedBudget(uniqueNormalized)) {
      if (batch.length === 0) continue;
      const { data: queries, error } = await supabase
        .from("seo_queries")
        .select("id, normalized_query, analysis_status")
        .in("normalized_query", batch);
      if (error) {
        return {
          normalize,
          queryByNormalized,
          reservationByQueryId,
          proposedQueryIds,
          failedStage: "seo_discovery_queries_load_failed",
        };
      }
      for (const row of queries ?? []) {
        queryByNormalized.set(row.normalized_query as string, {
          id: row.id as string,
          analysisStatus: row.analysis_status as string,
        });
      }
    }
  }

  const queryIds = [...queryByNormalized.values()].map((item) => item.id);
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
      if (error) {
        return {
          normalize,
          queryByNormalized,
          reservationByQueryId,
          proposedQueryIds,
          failedStage: "seo_discovery_reservations_load_failed",
        };
      }
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
        if (productError) {
          return {
            normalize,
            queryByNormalized,
            reservationByQueryId,
            proposedQueryIds,
            failedStage: "seo_discovery_products_load_failed",
          };
        }
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

  if (queryIds.length > 0) {
    for (const batch of chunkList(queryIds)) {
      if (batch.length === 0) continue;
      const { data: proposals, error } = await supabase
        .from("seo_query_proposals")
        .select("query_id")
        .eq("author_id", input.authorId)
        .in("query_id", batch);
      if (error) {
        return {
          normalize,
          queryByNormalized,
          reservationByQueryId,
          proposedQueryIds,
          failedStage: "seo_discovery_proposals_load_failed",
        };
      }
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
    failedStage: null,
  };
}

const ANALYZED_CANDIDATE_LIMIT = 250;

/**
 * Load analyzed SEO queries relevant to a seed without a full-table scan when possible:
 * exact normalized match + token ILIKE filters, then deterministic in-memory ranking.
 */
export type RankedDiscoveryMatch = RankableSeoQuery & {
  score: number;
  reasons: string[];
  reservation: DiscoveryReservationRow | null;
  publishedOccupancy: PublishedSeoQueryOccupancy | null;
  ownershipKnown: boolean;
};

export async function loadRankedAnalyzedQueriesForSeed(input: {
  authorId: string;
  seedPhrase: string;
  surface?: AuthorSeoDiscoverySurface;
  supabase?: DiscoveryReadClient;
}): Promise<{
  seedNormalized: string | null;
  matches: RankedDiscoveryMatch[];
  supplementaryStage: string | null;
  ownershipKnown: boolean;
}> {
  const supabase = input.supabase ?? createServiceRoleClient();
  const { data: normalizedRaw, error: normalizeError } = await supabase.rpc(
    "normalize_seo_query",
    { p_query: input.seedPhrase },
  );
  const mirroredSeed = normalizeSeoQueryText(input.seedPhrase);
  const seedNormalized =
    !normalizeError && typeof normalizedRaw === "string" && normalizedRaw
      ? normalizedRaw
      : mirroredSeed || null;
  let supplementaryStage: string | null =
    normalizeError && !seedNormalized ? "seo_discovery_normalize_failed" : null;

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
    if (error) {
      supplementaryStage ??= "seo_discovery_analyzed_token_load_failed";
      break;
    }
    await ingestRows(data as Array<Record<string, unknown>> | null);
    if (candidates.size >= ANALYZED_CANDIDATE_LIMIT) break;
  }

  // No top-frequency fallback: if nothing matched by exact/token ILIKE,
  // leave candidates empty so the DB block stays empty for the author.

  const seedClass = classifySeoQuery({ queryText: input.seedPhrase });
  const rankingLimit =
    input.surface === AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE
      ? SEO_DISCOVERY_DATABASE_CANDIDATE_LIMIT
      : SEO_DISCOVERY_DATABASE_LIMIT;
  const ranked = rankAnalyzedQueriesForSeed({
    seedPhrase: input.seedPhrase,
    seedNormalized,
    queries: [...candidates.values()].filter(
      (query) => query.analysisStatus === "analyzed",
    ),
    limit: rankingLimit,
    seedIntentHint: seedClass.intent,
    seedFormatHint: seedClass.recommendedFormat,
  });
  const exactCandidate = seedNormalized
    ? [...candidates.values()].find(
        (query) => query.normalizedQuery === seedNormalized,
      ) ?? null
    : null;
  const ordered =
    exactCandidate && !ranked.some((item) => item.id === exactCandidate.id)
      ? [
          {
            ...exactCandidate,
            score: 10_000,
            reasons: ["exact_normalized_match"],
          },
          ...ranked,
        ]
      : ranked;

  const reservationByQueryId = new Map<string, DiscoveryReservationRow>();
  let ownershipKnown = true;
  let occupancyByQueryId: Map<string, SeoOccupancyHit> = new Map();
  if (ordered.length > 0) {
    try {
      occupancyByQueryId = await loadPublishedSeoOccupancyForQueries(
        supabase as never,
        ordered.map((item) => ({
          id: item.id,
          queryText: item.queryText,
          normalizedQuery: item.normalizedQuery,
        })),
      );
    } catch (error) {
      ownershipKnown = false;
      occupancyByQueryId = new Map();
      supplementaryStage ??=
        error instanceof Error && error.message
          ? error.message
          : "seo_published_occupancy_load_failed";
    }
    await supabase.rpc("expire_seo_query_reservation", {
      p_author_id: input.authorId,
    });
  }

  const attached: RankedDiscoveryMatch[] = [];

  for (const batch of chunkList(ordered)) {
    if (batch.length === 0) continue;
    if (!ownershipKnown) {
      for (const item of batch) {
        attached.push({
          ...item,
          reservation: null,
          publishedOccupancy: null,
          ownershipKnown: false,
        });
      }
      continue;
    }

    const batchIds = batch.map((item) => item.id);
    const { data: reservations, error } = await supabase
      .from("seo_query_reservations")
      .select("id, query_id, author_id, status, product_id, expires_at")
      .in("query_id", batchIds)
      .in("status", ["active", "used"]);
    if (error) {
      ownershipKnown = false;
      supplementaryStage ??= "seo_discovery_reservations_load_failed";
      for (const item of attached) {
        item.reservation = null;
        item.publishedOccupancy = null;
        item.ownershipKnown = false;
      }
      for (const item of batch) {
        attached.push({
          ...item,
          reservation: null,
          publishedOccupancy: null,
          ownershipKnown: false,
        });
      }
      continue;
    }
    const productIds = (
      (reservations ?? []) as Array<{ product_id?: string | null }>
    )
      .map((row) =>
        typeof row.product_id === "string" ? row.product_id : null,
      )
      .filter((id): id is string => Boolean(id));
    const productTitleById = new Map<string, string>();
    if (productIds.length > 0) {
      for (const productBatch of chunkList([...new Set(productIds)])) {
        const { data: products, error: productError } = await supabase
          .from("practices")
          .select("id, title")
          .in("id", productBatch);
        if (productError) {
          supplementaryStage ??= "seo_discovery_products_load_failed";
          break;
        }
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

    for (const item of batch) {
      const occupancy = ownershipKnown
        ? occupancyByQueryId.get(item.id) ?? null
        : null;
      attached.push({
        ...item,
        reservation: ownershipKnown
          ? reservationByQueryId.get(item.id) ?? null
          : null,
        publishedOccupancy:
          ownershipKnown && occupancy
            ? toPublishedSeoQueryOccupancy(occupancy)
            : null,
        ownershipKnown,
      });
    }
    if (
      input.surface === AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE &&
      takeRankedDiscoveryItemsUntilVisible({
        surface: input.surface,
        items: attached,
        visibleLimit: SEO_DISCOVERY_DATABASE_LIMIT,
      }).filter(
        (item) =>
          !isHiddenFromProductCreateDiscovery(
            item.reservation,
            item.publishedOccupancy,
          ),
      ).length >= SEO_DISCOVERY_DATABASE_LIMIT
    ) {
      break;
    }
  }

  const matches =
    input.surface === AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE
      ? takeRankedDiscoveryItemsUntilVisible({
          surface: input.surface,
          items: attached,
          visibleLimit: SEO_DISCOVERY_DATABASE_LIMIT,
        })
      : attached;

  return {
    seedNormalized,
    matches,
    supplementaryStage,
    ownershipKnown,
  };
}
