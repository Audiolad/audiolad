import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CourseContentAccessInput } from "@/lib/products/access";
import { isCoursePublication } from "@/lib/course-content/validators";

import {
  resolveCourseLearnerAccess,
  type CourseLearnerAccessOptions,
} from "./learner-access";
import type {
  LearnerAudioAssetSource,
  LearnerBlockSource,
  LearnerFileAssetSource,
  LearnerLessonSource,
  LearnerLevelSource,
} from "./learner-dto";
import { serializeLearnerCourse, toLearnerCourse } from "./learner-dto";
import type { LearnerCourse } from "./learner-types";

export type LoadCourseLearnerContentResult =
  | { ok: true; course: LearnerCourse }
  | {
      ok: false;
      reason: "unauthenticated" | "not_course" | "forbidden" | "error";
    };

const LESSON_SELECT = "id, title, position, required_access_level";
const BLOCK_SELECT = "id, lesson_id, type, position, asset_id, payload";
const AUDIO_SELECT = "id, title, duration_seconds";
const FILE_SELECT = "id, original_name, mime, size_bytes";
const LEVEL_SELECT = "level, title, description, upgrade_price, currency";

/**
 * Server-only learner loader. Parent course / viewer access is the root of
 * the check — this never loads a lesson or asset first.
 *
 * Chain: authenticated viewer → resolveProductAccess →
 * resolveCourseLearnerAccess → service-role read → per-lesson redaction.
 */
export async function loadCourseLearnerContent(input: {
  supabase: SupabaseClient;
  serviceRole: SupabaseClient;
  userId: string | null;
  practice: CourseContentAccessInput;
  options?: CourseLearnerAccessOptions;
}): Promise<LoadCourseLearnerContentResult> {
  if (!input.userId) {
    return { ok: false, reason: "unauthenticated" };
  }

  if (
    !isCoursePublication(
      input.practice.publication_class,
      input.practice.product_kind,
    )
  ) {
    return { ok: false, reason: "not_course" };
  }

  try {
    const access = await resolveCourseLearnerAccess(
      input.supabase,
      input.practice,
      input.userId,
      input.options,
    );

    if (!access.canReadPrivateContent) {
      return { ok: false, reason: "forbidden" };
    }

    const [lessons, levels] = await Promise.all([
      loadLessons(input.serviceRole, input.practice.id),
      loadLevels(input.serviceRole, input.practice.id),
    ]);

    const lessonIds = lessons.map((lesson) => lesson.id);
    const blocks = await loadBlocks(input.serviceRole, lessonIds);

    const audioIds = blocks
      .filter((block) => block.type === "audio" && block.asset_id)
      .map((block) => block.asset_id as string);
    const fileIds = blocks
      .filter((block) => block.type === "file" && block.asset_id)
      .map((block) => block.asset_id as string);

    const [audioAssets, fileAssets] = await Promise.all([
      loadAudioAssets(input.serviceRole, input.practice.id, audioIds),
      loadFileAssets(input.serviceRole, input.practice.id, fileIds),
    ]);

    const course = serializeLearnerCourse(
      toLearnerCourse({
        publicationId: input.practice.id,
        access,
        lessons,
        blocks,
        audioAssets,
        fileAssets,
        levels,
      }),
    );

    return { ok: true, course };
  } catch {
    return { ok: false, reason: "error" };
  }
}

async function loadLessons(
  serviceRole: SupabaseClient,
  publicationId: string,
): Promise<LearnerLessonSource[]> {
  const { data, error } = await serviceRole
    .from("course_lessons")
    .select(LESSON_SELECT)
    .eq("publication_id", publicationId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error("course_lessons_lookup_failed");
  }

  return (data ?? []) as LearnerLessonSource[];
}

async function loadBlocks(
  serviceRole: SupabaseClient,
  lessonIds: string[],
): Promise<LearnerBlockSource[]> {
  if (lessonIds.length === 0) {
    return [];
  }

  const { data, error } = await serviceRole
    .from("course_lesson_blocks")
    .select(BLOCK_SELECT)
    .in("lesson_id", lessonIds)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error("course_lesson_blocks_lookup_failed");
  }

  return (data ?? []) as LearnerBlockSource[];
}

async function loadLevels(
  serviceRole: SupabaseClient,
  publicationId: string,
): Promise<LearnerLevelSource[]> {
  const { data, error } = await serviceRole
    .from("practice_access_levels")
    .select(LEVEL_SELECT)
    .eq("practice_id", publicationId)
    .order("level", { ascending: true });

  if (error) {
    throw new Error("practice_access_levels_lookup_failed");
  }

  return (data ?? []) as LearnerLevelSource[];
}

async function loadAudioAssets(
  serviceRole: SupabaseClient,
  publicationId: string,
  ids: string[],
): Promise<Map<string, LearnerAudioAssetSource>> {
  const map = new Map<string, LearnerAudioAssetSource>();
  if (ids.length === 0) {
    return map;
  }

  const { data, error } = await serviceRole
    .from("audio_items")
    .select(AUDIO_SELECT)
    .eq("practice_id", publicationId)
    .in("id", ids);

  if (error) {
    throw new Error("course_audio_items_lookup_failed");
  }

  for (const row of (data ?? []) as LearnerAudioAssetSource[]) {
    map.set(row.id, row);
  }

  return map;
}

async function loadFileAssets(
  serviceRole: SupabaseClient,
  publicationId: string,
  ids: string[],
): Promise<Map<string, LearnerFileAssetSource>> {
  const map = new Map<string, LearnerFileAssetSource>();
  if (ids.length === 0) {
    return map;
  }

  const { data, error } = await serviceRole
    .from("publication_files")
    .select(FILE_SELECT)
    .eq("publication_id", publicationId)
    .in("id", ids);

  if (error) {
    throw new Error("course_publication_files_lookup_failed");
  }

  for (const row of (data ?? []) as LearnerFileAssetSource[]) {
    map.set(row.id, row);
  }

  return map;
}
