import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { chunkIds } from "@/lib/supabase/chunk";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  AUDIO_SPRINT_OSEN_ZVUCHIT_SLUG,
  audioSprintEnabledPools,
  audioSprintProductMatchesGroup,
  isAudioSprintAuthorGroup,
  isAudioSprintPoolVisible,
  selectVisibleAudioSprintQueries,
  type AudioSprintAuthorGroup,
  type AudioSprintQueryCard,
} from "@/lib/seo-queries/audio-sprint";
import { loadPublishedSeoOccupancyForQueries } from "@/lib/seo-queries/load-published-seo-occupancy";
import { lifecycleForSeoOpportunity } from "@/lib/seo-queries/published-query-occupancy";
import { isEffectiveSeoReservation } from "@/lib/seo-queries/reservation-effective";

type MembershipRow = {
  query_id: string;
  author_group: string;
  pool: string;
  queryText: string;
  normalizedQuery: string | null;
};

type ReservationRow = {
  id: string;
  query_id: string;
  author_id: string;
  product_id: string | null;
  expires_at: string | null;
  status: string;
};

export type AudioSprintListing = {
  sprint: { id: string; slug: string; title: string };
  queries: AudioSprintQueryCard[];
  activeReservationCount: number;
};

export type AudioSprintTitleConstraintResult =
  | {
      ok: true;
      queryText: string | null;
      authorGroup: AudioSprintAuthorGroup | null;
    }
  | { ok: false };

const NO_SPRINT_MATCH: AudioSprintTitleConstraintResult = {
  ok: true,
  queryText: null,
  authorGroup: null,
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Public nginx 502s (`upstream sent too big header`) when PostgREST echoes a
 * long UUID `.in()` in Content-Location. n≤90 can pass; n=100 does not.
 * Same cap as loadPublishedSeoOccupancyForQueries (ID_CHUNK = 40).
 */
const AUDIO_SPRINT_IN_CHUNK = 40;

function audioSprintErrorLog(error: unknown): {
  code: string | null;
  message: string | null;
  details: string | null;
} {
  if (!error || typeof error !== "object") {
    return { code: null, message: null, details: null };
  }
  const row = error as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    code: text(row.code),
    message: text(row.message),
    details: text(row.details),
  };
}

function failAudioSprintLoad(wrapper: string, error: unknown): never {
  console.error(wrapper, audioSprintErrorLog(error));
  throw new Error(wrapper);
}

async function loadRowsByIdChunks<T>(
  ids: readonly string[],
  wrapper: string,
  query: (
    chunk: string[],
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const rows: T[] = [];
  for (const chunk of chunkIds(ids, AUDIO_SPRINT_IN_CHUNK)) {
    const { data, error } = await query(chunk);
    if (error) failAudioSprintLoad(wrapper, error);
    if (data?.length) rows.push(...data);
  }
  return rows;
}

async function findEnabledSprintQueryText(
  supabase: SupabaseClient,
  queryId: string,
): Promise<AudioSprintTitleConstraintResult> {
  const { data: rows, error } = await supabase
    .from("seo_sprint_queries")
    .select("pool, sprint_id, author_group")
    .eq("query_id", queryId);

  if (error) return { ok: false };

  const visible = (rows ?? []).filter((row) =>
    isAudioSprintPoolVisible(readString(row.pool)),
  );
  if (visible.length === 0) return NO_SPRINT_MATCH;

  const sprintIds = [
    ...new Set(visible.map((row) => readString(row.sprint_id)).filter(Boolean)),
  ];
  if (sprintIds.length === 0) return NO_SPRINT_MATCH;

  const { data: sprints, error: sprintError } = await supabase
    .from("seo_sprints")
    .select("id")
    .in("id", sprintIds)
    .eq("slug", AUDIO_SPRINT_OSEN_ZVUCHIT_SLUG);

  if (sprintError) return { ok: false };
  const enabledSprintIds = new Set((sprints ?? []).map((row) => readString(row.id)));
  if (enabledSprintIds.size === 0) return NO_SPRINT_MATCH;

  const groups = new Set<AudioSprintAuthorGroup>();
  for (const row of visible) {
    if (!enabledSprintIds.has(readString(row.sprint_id))) continue;
    const authorGroup = readString(row.author_group);
    if (!isAudioSprintAuthorGroup(authorGroup)) return { ok: false };
    groups.add(authorGroup);
  }
  if (groups.size === 0) return NO_SPRINT_MATCH;
  if (groups.size !== 1) return { ok: false };
  const authorGroup = [...groups][0];

  const { data: query, error: queryError } = await supabase
    .from("seo_queries")
    .select("query_text")
    .eq("id", queryId)
    .maybeSingle();

  if (queryError) return { ok: false };
  const queryText = readString(query?.query_text);
  if (!queryText) return { ok: false };
  return { ok: true, queryText, authorGroup };
}

/**
 * Title-lock text for a sprint query only when the product class matches
 * author_group. A mismatched pair returns null so the lock is not applied.
 * Lookup errors return null for the editor; submit still fail-closes.
 */
export async function loadEnabledAudioSprintQueryText(
  supabase: SupabaseClient,
  queryId: string | null | undefined,
  product: {
    publicationClass: string | null | undefined;
    productKind: string | null | undefined;
  },
): Promise<string | null> {
  const found = await loadAudioSprintModerationQuery(supabase, queryId);
  if (!found.ok || !found.queryText || !found.authorGroup) return null;
  if (
    !audioSprintProductMatchesGroup({
      authorGroup: found.authorGroup,
      publicationClass: product.publicationClass,
      productKind: product.productKind,
    })
  ) {
    return null;
  }
  return found.queryText;
}

/** Fail-closed lookup for submit-for-moderation. Empty query id is not a sprint product. */
export async function loadAudioSprintModerationQuery(
  supabase: SupabaseClient,
  queryId: string | null | undefined,
): Promise<AudioSprintTitleConstraintResult> {
  const id = readString(queryId);
  if (!id) return NO_SPRINT_MATCH;
  return findEnabledSprintQueryText(supabase, id);
}

/**
 * Apply the sprint title lock only for a matching author_group ↔ product class.
 * Mismatch returns no constraint. The product row's class wins over the caller.
 */
function titleLockForMatchedPair(
  found: Extract<AudioSprintTitleConstraintResult, { ok: true }>,
  publicationClass: string | null,
  productKind: string | null,
): AudioSprintTitleConstraintResult {
  if (!found.queryText || !found.authorGroup) return NO_SPRINT_MATCH;
  if (
    !audioSprintProductMatchesGroup({
      authorGroup: found.authorGroup,
      publicationClass,
      productKind,
    })
  ) {
    return NO_SPRINT_MATCH;
  }
  return found;
}

/**
 * Title constraint for a sprint-linked product.
 * Primary query wins. An unlinked create/save may pass the caller's reservation.
 * Ordinary products (query outside the enabled pool) get no constraint.
 */
export async function resolveAudioSprintTitleConstraint(
  supabase: SupabaseClient,
  input: {
    practiceId?: string | null;
    seoReservationId?: string | null;
    authorId?: string | null;
    publicationClass?: string | null;
    productKind?: string | null;
  },
): Promise<AudioSprintTitleConstraintResult> {
  const practiceId = readString(input.practiceId);
  const reservationId = readString(input.seoReservationId);
  const authorId = readString(input.authorId);
  let publicationClass = readString(input.publicationClass) || null;
  let productKind = readString(input.productKind) || null;

  if (practiceId) {
    const { data: practice, error } = await supabase
      .from("practices")
      .select("primary_seo_query_id, publication_class, product_kind")
      .eq("id", practiceId)
      .maybeSingle();
    if (error) return { ok: false };
    publicationClass = readString(practice?.publication_class) || null;
    productKind = readString(practice?.product_kind) || null;
    const queryId = readString(practice?.primary_seo_query_id);
    if (queryId) {
      const found = await findEnabledSprintQueryText(supabase, queryId);
      if (!found.ok) return found;
      if (found.queryText) {
        return titleLockForMatchedPair(found, publicationClass, productKind);
      }
    }
  }

  if (!reservationId) return NO_SPRINT_MATCH;

  const { data: reservation, error: reservationError } = await supabase
    .from("seo_query_reservations")
    .select("query_id, author_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (reservationError) return { ok: false };
  if (!reservation) return NO_SPRINT_MATCH;
  if (authorId && readString(reservation.author_id) !== authorId) {
    return NO_SPRINT_MATCH;
  }
  const queryId = readString(reservation.query_id);
  if (!queryId) return NO_SPRINT_MATCH;
  const found = await findEnabledSprintQueryText(supabase, queryId);
  if (!found.ok) return found;
  return titleLockForMatchedPair(found, publicationClass, productKind);
}

export async function listAudioSprintForAuthor(
  input: {
    slug: string;
    authorId: string;
    authorWorkspaces?: ReadonlyArray<{
      id: string;
      name: string;
      slug: string;
    }>;
  },
  supabaseClient?: SupabaseClient,
): Promise<AudioSprintListing | null> {
  const slug = input.slug.trim();
  const authorId = input.authorId.trim();
  if (!slug || !authorId) return null;

  const supabase = supabaseClient ?? createServiceRoleClient();
  await supabase.rpc("expire_seo_query_reservation", { p_author_id: authorId });

  const { data: sprint, error: sprintError } = await supabase
    .from("seo_sprints")
    .select("id, slug, title")
    .eq("slug", slug)
    .maybeSingle();

  if (sprintError) throw new Error("audio_sprint_load_failed");
  if (!sprint?.id || readString(sprint.slug) !== slug) return null;

  const { data: membershipRows, error: membershipError } = await supabase
    .from("seo_sprint_queries")
    .select("query_id, author_group, pool")
    .eq("sprint_id", sprint.id)
    .in("pool", audioSprintEnabledPools());

  if (membershipError) throw new Error("audio_sprint_queries_load_failed");

  const membership = (membershipRows ?? []).filter(
    (row) =>
      readString(row.query_id) &&
      isAudioSprintAuthorGroup(readString(row.author_group)) &&
      isAudioSprintPoolVisible(readString(row.pool)),
  );
  const queryIds = [...new Set(membership.map((row) => readString(row.query_id)))];

  const queryRows = await loadRowsByIdChunks(
    queryIds,
    "audio_sprint_queries_load_failed",
    (chunk) =>
      supabase
        .from("seo_queries")
        .select("id, query_text, normalized_query")
        .in("id", chunk),
  );

  const queryById = new Map(
    queryRows.map((row) => [readString(row.id), row]),
  );

  const joined: MembershipRow[] = [];
  for (const row of membership) {
    const query = queryById.get(readString(row.query_id));
    const queryText = readString(query?.query_text);
    if (!queryText) continue;
    joined.push({
      query_id: readString(row.query_id),
      author_group: readString(row.author_group),
      pool: readString(row.pool),
      queryText,
      normalizedQuery: readString(query?.normalized_query) || null,
    });
  }

  const [reservationRows, activeCount] = await Promise.all([
    loadRowsByIdChunks(
      queryIds,
      "audio_sprint_reservations_load_failed",
      (chunk) =>
        supabase
          .from("seo_query_reservations")
          .select("id, query_id, author_id, product_id, expires_at, status")
          .in("query_id", chunk)
          .in("status", ["active", "used"]),
    ),
    countAuthorActiveSeoReservations(supabase, authorId),
  ]);

  const now = new Date();
  const reservations = (reservationRows as ReservationRow[]).filter((row) =>
    isEffectiveSeoReservation(
      {
        status: row.status,
        productId: row.product_id,
        expiresAt: row.expires_at,
      },
      now,
    ),
  );

  const productIds = reservations
    .map((row) => row.product_id)
    .filter((id): id is string => Boolean(id));
  const products = await loadRowsByIdChunks(
    productIds,
    "audio_sprint_products_load_failed",
    (chunk) =>
      supabase
        .from("practices")
        .select("id, title, status, moderation_status")
        .in("id", chunk),
  );

  const reservationByQuery = new Map(
    reservations.map((row) => [row.query_id, row]),
  );
  const productById = new Map(
    products.map((row) => [readString(row.id), row]),
  );
  const occupancyByQueryId = await loadPublishedSeoOccupancyForQueries(
    supabase,
    joined.map((row) => ({
      id: row.query_id,
      queryText: row.queryText,
      normalizedQuery: row.normalizedQuery,
    })),
  );

  const workspaceById = new Map(
    (input.authorWorkspaces ?? []).map((workspace) => [
      workspace.id,
      {
        name: workspace.name.trim(),
        slug: workspace.slug.trim(),
      },
    ]),
  );

  const cards = joined.map((row) => {
    const reservation = reservationByQuery.get(row.query_id);
    const product = reservation?.product_id
      ? productById.get(reservation.product_id)
      : undefined;
    const own = reservation?.author_id === authorId;
    const reservationWorkspace = reservation
      ? workspaceById.get(reservation.author_id)
      : undefined;
    const reservedByCurrentUser = Boolean(reservation) && (own || Boolean(reservationWorkspace));
    return {
      id: row.query_id,
      queryText: row.queryText,
      authorGroup: row.author_group as AudioSprintAuthorGroup,
      pool: row.pool as AudioSprintQueryCard["pool"],
      lifecycle: lifecycleForSeoOpportunity({
        reservation,
        product,
        publishedOccupancy: occupancyByQueryId.get(row.query_id) ?? null,
      }),
      reservationId: own ? reservation.id : null,
      expiresAt: own ? reservation.expires_at : null,
      productId: own ? reservation.product_id : null,
      reservedByCurrentUser,
      reservationWorkspaceName: reservedByCurrentUser
        ? reservationWorkspace?.name || null
        : null,
      reservationWorkspaceSlug: reservedByCurrentUser
        ? reservationWorkspace?.slug || null
        : null,
    } satisfies AudioSprintQueryCard;
  });

  return {
    sprint: {
      id: readString(sprint.id),
      slug: readString(sprint.slug),
      title: readString(sprint.title) || readString(sprint.slug),
    },
    queries: selectVisibleAudioSprintQueries(cards),
    activeReservationCount: activeCount,
  };
}

async function countAuthorActiveSeoReservations(
  supabase: SupabaseClient,
  authorId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("seo_query_reservations")
    .select("id, status, product_id, expires_at")
    .eq("author_id", authorId)
    .eq("status", "active");
  if (error) throw new Error("audio_sprint_reservation_count_failed");
  const now = new Date();
  return (data ?? []).filter((row) =>
    isEffectiveSeoReservation(
      {
        status: readString(row.status) || "active",
        productId: readString(row.product_id) || null,
        expiresAt: readString(row.expires_at) || null,
      },
      now,
    ),
  ).length;
}
