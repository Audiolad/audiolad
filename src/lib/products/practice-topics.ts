import type { SupabaseClient } from "@supabase/supabase-js";

import { getActivePracticeTopics } from "@/lib/topics/queries";

export type PublicPracticeTopicLink = {
  key: string;
  title: string;
};

export async function loadPublicPracticeTopicsSafe(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PublicPracticeTopicLink[]> {
  try {
    return await getActivePracticeTopics(supabase, practiceId);
  } catch (error) {
    console.error("[practice] topics_load_failed", {
      practiceId,
      message: error instanceof Error ? error.message : String(error),
    });

    return [];
  }
}
