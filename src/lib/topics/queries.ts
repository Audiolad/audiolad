import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AssignedTopic,
  PracticeTopicsResult,
  TopicOption,
  TopicRow,
  TopicWithCatalogCount,
} from "./types";

const TOPIC_SELECT =
  "id, key, slug, title, description, sort_order, is_active, show_on_home, created_at, updated_at";

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
    .select("id")
    .eq("status", "published")
    .eq("is_catalog_listed", true);

  if (practicesError) {
    throw new Error("topics_catalog_counts_failed");
  }

  const practiceIds = (practiceRows ?? []).map((row) => row.id as string);

  if (practiceIds.length === 0) {
    return topics.map((topic) => ({
      ...topic,
      catalogProductCount: 0,
    }));
  }

  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from("practice_topics")
    .select("practice_id, topic_id, topics!inner(key)")
    .in("practice_id", practiceIds);

  if (assignmentsError) {
    throw new Error("topics_catalog_counts_failed");
  }

  const countByKey = new Map<string, number>();

  for (const row of assignmentRows ?? []) {
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
