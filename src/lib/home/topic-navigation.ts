import type { SupabaseClient } from "@supabase/supabase-js";

import { buildCatalogTopicHref } from "@/lib/catalog/topic-filter";
import { listHomeTopicsWithCatalogCounts } from "@/lib/topics/queries";
import type { TopicWithCatalogCount } from "@/lib/topics/types";

import { safeHomeSection } from "./safe";

export type HomeTopicItem = {
  key: string;
  title: string;
  href: string;
};

export function mapHomeTopicItems(
  topics: readonly TopicWithCatalogCount[],
): HomeTopicItem[] {
  return topics.map((topic) => ({
    key: topic.key,
    title: topic.title,
    href: buildCatalogTopicHref(topic.key),
  }));
}

/** Even indices → first row, odd indices → second row (mobile two-line scroll). */
export function splitHomeTopicsIntoScrollRows(topics: readonly HomeTopicItem[]): {
  firstRow: HomeTopicItem[];
  secondRow: HomeTopicItem[];
} {
  const firstRow: HomeTopicItem[] = [];
  const secondRow: HomeTopicItem[] = [];

  topics.forEach((topic, index) => {
    if (index % 2 === 0) {
      firstRow.push(topic);
    } else {
      secondRow.push(topic);
    }
  });

  return { firstRow, secondRow };
}

export function shouldWrapHomeTopicChip(title: string): boolean {
  return title.trim().length > 20;
}

export async function loadHomeTopicsSafe(
  supabase: SupabaseClient,
): Promise<HomeTopicItem[]> {
  return safeHomeSection(
    "home_topics",
    async () => {
      const topics = await listHomeTopicsWithCatalogCounts(supabase);
      return mapHomeTopicItems(topics);
    },
    [],
  );
}
