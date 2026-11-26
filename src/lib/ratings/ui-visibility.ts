import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCoursePublication } from "@/lib/course-content/validators";

import { resolvePracticeRatingsUiEnabled } from "./ui-visibility-policy";

export { resolvePracticeRatingsUiEnabled } from "./ui-visibility-policy";

export async function practiceHasStructuredCourseLessons(
  client: SupabaseClient,
  practiceId: string,
): Promise<boolean> {
  const { count, error } = await client
    .from("course_lessons")
    .select("id", { count: "exact", head: true })
    .eq("publication_id", practiceId)
    .limit(1);

  if (error) {
    throw new Error("course_lessons_lookup_failed");
  }

  return (count ?? 0) > 0;
}

export async function resolvePracticeRatingsUiEnabledForPractice(
  client: SupabaseClient,
  practice: {
    id: string;
    publication_class: string | null | undefined;
    product_kind: string | null | undefined;
  },
): Promise<boolean> {
  const hasStructuredCourseLessons = isCoursePublication(
    practice.publication_class,
    practice.product_kind,
  )
    ? await practiceHasStructuredCourseLessons(client, practice.id)
    : false;

  return resolvePracticeRatingsUiEnabled({
    publicationClass: practice.publication_class,
    productKind: practice.product_kind,
    hasStructuredCourseLessons,
  });
}