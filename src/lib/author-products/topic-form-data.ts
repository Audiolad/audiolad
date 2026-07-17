import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorTopicLimit } from "@/lib/topics/limits";
import { getPracticeTopics, listActiveTopics } from "@/lib/topics/queries";
import type { AssignedTopic, TopicOption } from "@/lib/topics/types";

export type AuthorProductTopicFormData = {
  topicLimit: number;
  topicOptions: TopicOption[];
  selectedTopicKeys: string[];
  archivedTopics: AssignedTopic[];
};

export async function loadAuthorProductTopicFormData(
  supabase: SupabaseClient,
  authorId: string,
  practiceId?: string | null,
): Promise<AuthorProductTopicFormData> {
  const normalizedAuthorId = authorId.trim();

  const [topicLimit, topicOptions, practiceTopics] = await Promise.all([
    resolveAuthorTopicLimit(supabase, { authorId: normalizedAuthorId }),
    listActiveTopics(supabase),
    practiceId
      ? getPracticeTopics(supabase, practiceId)
      : Promise.resolve({ activeTopics: [], archivedTopics: [] }),
  ]);

  return {
    topicLimit,
    topicOptions,
    selectedTopicKeys: practiceTopics.activeTopics.map((topic) => topic.key),
    archivedTopics: practiceTopics.archivedTopics,
  };
}
