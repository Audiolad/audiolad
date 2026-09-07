import type { SupabaseClient } from "@supabase/supabase-js";

import { filterPublicPracticeRows } from "@/lib/fixtures/test-fixture-marker";

import type {
  AssignedTopic,
  PracticeTopicsResult,
  TopicOption,
  TopicRow,
  TopicWithCatalogCount,
} from "./types";

const TOPIC_SELECT =
  "id, key, slug, title, description, sort_order, is_active, show_on_home, created_at, updated_at";

/** PostgREST `.in(practice_id, …)` URL/payload limit — 93 UUIDs 502 nginx in prod. */
export const PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE = 50;

type PracticeTopicAssignmentRow = {
  practice_id?: string;
  topic_id?: string;
  topics?: { key?: string } | { key?: string }[] | null;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number | string;
};

export function chunkIds<T>(
  ids: readonly T[],
  chunkSize: number = PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE,
): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }

  return chunks;
}

function extractSupabaseLikeError(error: unknown): SupabaseLikeError {
  if (!error || typeof error !== "object") {
    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const record = error as Record<string, unknown>;

  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message:
      typeof record.message === "string"
        ? record.message
        : error instanceof Error
          ? error.message
          : undefined,
    details: typeof record.details === "string" ? record.details : undefined,
    hint: typeof record.hint === "string" ? record.hint : undefined,
    status:
      typeof record.status === "number" || typeof record.status === "string"
        ? record.status
        : undefined,
  };
}

export function logTopicsCatalogCountsError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const supabaseError = extractSupabaseLikeError(error);

  console.error("[topics] topics_catalog_counts_failed", {
    code: supabaseError.code ?? null,
    message: supabaseError.message ?? null,
    details: supabaseError.details ?? null,
    hint: supabaseError.hint ?? null,
    status: supabaseError.status ?? null,
    ...context,
  });
}

function throwTopicsCatalogCountsFailed(
  error: unknown,
  context?: Record<string, unknown>,
): never {
  logTopicsCatalogCountsError(error, context);
  throw new Error("topics_catalog_counts_failed", { cause: error });
}

export async function listTopicsWithCatalogCountsSafe(
  supabase: SupabaseClient,
): Promise<TopicWithCatalogCount[]> {
  try {
    return await listTopicsWithCatalogCounts(supabase);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "topics_catalog_counts_failed"
    ) {
      logTopicsCatalogCountsError(error, { stage: "soft_fail_wrapper" });
    }

    return [];
  }
}

function mapTopicRow(row: TopicRow): TopicOption {
  return {
    key: row.key,
    slug: row.slug,
    title: row.title,
    description: row.description?.trim() || null,
    sortOrder: row.sort_order,
    showOnHome: row.show_on_home,
  };
}

function mapAssignedTopic(row: TopicRow): AssignedTopic {
  return {
    ...mapTopicRow(row),
    isActive: row.is_active,
  };
}

export async function listActiveTopics(
  supabase: SupabaseClient,
): Promise<TopicOption[]> {
  const { data, error } = await supabase
    .from("topics")
    .select(TOPIC_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    throw new Error("topics_list_failed");
  }

  return ((data ?? []) as TopicRow[]).map(mapTopicRow);
}

export async function listHomeTopics(
  supabase: SupabaseClient,
): Promise<TopicOption[]> {
  const { data, error } = await supabase
    .from("topics")
    .select(TOPIC_SELECT)
    .eq("is_active", true)
    .eq("show_on_home", true)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    throw new Error("topics_home_list_failed");
  }

  return ((data ?? []) as TopicRow[]).map(mapTopicRow);
}

export async function getTopicBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<TopicOption | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  const { data, error } = await supabase
    .from("topics")
    .select(TOPIC_SELECT)
    .eq("is_active", true)
    .eq("slug", normalizedSlug)
    .maybeSingle();

  if (error) {
    throw new Error("topic_lookup_failed");
  }

  if (!data) {
    return null;
  }

  return mapTopicRow(data as TopicRow);
}

export async function listTopicsWithCatalogCounts(
  supabase: SupabaseClient,
): Promise<TopicWithCatalogCount[]> {
  const topics = await listActiveTopics(supabase);

  if (topics.length === 0) {
    return [];
  }

  const { data: practiceRows, error: practicesError } = await supabase
    .from("practices")
    .select("id, cover_image")
    .eq("status", "published")
    .eq("is_catalog_listed", true);

  if (practicesError) {
    throwTopicsCatalogCountsFailed(practicesError, {
      stage: "list_published_catalog_practice_ids",
    });
  }

  const practiceIds = filterPublicPracticeRows(
    (practiceRows ?? []) as Array<{ id: string; cover_image?: unknown }>,
  ).map((row) => row.id);

  if (practiceIds.length === 0) {
    return topics.map((topic) => ({
      ...topic,
      catalogProductCount: 0,
    }));
  }

  const assignmentRows: PracticeTopicAssignmentRow[] = [];
  const practiceIdChunks = chunkIds(
    practiceIds,
    PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE,
  );

  for (let chunkIndex = 0; chunkIndex < practiceIdChunks.length; chunkIndex += 1) {
    const chunk = practiceIdChunks[chunkIndex];
    const { data: chunkRows, error: assignmentsError } = await supabase
      .from("practice_topics")
      .select("practice_id, topic_id, topics!inner(key)")
      .in("practice_id", chunk);

    if (assignmentsError) {
      throwTopicsCatalogCountsFailed(assignmentsError, {
        stage: "list_practice_topic_assignments",
        chunkIndex,
        chunkSize: chunk.length,
        practiceCount: practiceIds.length,
        chunkCount: practiceIdChunks.length,
      });
    }

    assignmentRows.push(...((chunkRows ?? []) as PracticeTopicAssignmentRow[]));
  }

  const countByKey = new Map<string, number>();

  for (const row of assignmentRows) {
    const topicsValue = row.topics as { key?: string } | { key?: string }[] | null;
    const topic = Array.isArray(topicsValue) ? topicsValue[0] : topicsValue;
    const key = topic?.key?.trim();

    if (!key) {
      continue;
    }

    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  return topics.map((topic) => ({
    ...topic,
    catalogProductCount: countByKey.get(topic.key) ?? 0,
  }));
}

export async function listHomeTopicsWithCatalogCounts(
  supabase: SupabaseClient,
): Promise<TopicWithCatalogCount[]> {
  const topics = await listTopicsWithCatalogCounts(supabase);

  return topics.filter(
    (topic) => topic.showOnHome && topic.catalogProductCount > 0,
  );
}

type PracticeTopicJoinRow = {
  topic_id: string;
  topics: TopicRow | TopicRow[] | null;
};

export async function getPracticeTopics(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeTopicsResult> {
  const { data, error } = await supabase
    .from("practice_topics")
    .select(`topic_id, topics!inner (${TOPIC_SELECT})`)
    .eq("practice_id", practiceId);

  if (error) {
    throw new Error("practice_topics_lookup_failed");
  }

  const activeTopics: AssignedTopic[] = [];
  const archivedTopics: AssignedTopic[] = [];

  for (const row of (data ?? []) as PracticeTopicJoinRow[]) {
    const topicRow = Array.isArray(row.topics) ? row.topics[0] : row.topics;

    if (!topicRow?.key) {
      continue;
    }

    const assigned = mapAssignedTopic(topicRow);

    if (assigned.isActive) {
      activeTopics.push(assigned);
    } else {
      archivedTopics.push(assigned);
    }
  }

  const bySortOrder = (left: AssignedTopic, right: AssignedTopic) =>
    left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, "ru");

  activeTopics.sort(bySortOrder);
  archivedTopics.sort(bySortOrder);

  return { activeTopics, archivedTopics };
}

export async function getActivePracticeTopics(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<Array<{ key: string; title: string }>> {
  const { activeTopics } = await getPracticeTopics(supabase, practiceId);

  return activeTopics.map((topic) => ({
    key: topic.key,
    title: topic.title,
  }));
}

export async function getPracticeTopicKeys(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<string[]> {
  const { activeTopics } = await getPracticeTopics(supabase, practiceId);
  return activeTopics.map((topic) => topic.key);
}

export async function countActivePracticeTopics(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("practice_topics")
    .select("topic_id, topics!inner(is_active)")
    .eq("practice_id", practiceId);

  if (error) {
    throw new Error("practice_topics_count_failed");
  }

  let count = 0;

  for (const row of data ?? []) {
    const topicsValue = row.topics as { is_active?: boolean } | { is_active?: boolean }[] | null;
    const topic = Array.isArray(topicsValue) ? topicsValue[0] : topicsValue;

    if (topic?.is_active === true) {
      count += 1;
    }
  }

  return count;
}
