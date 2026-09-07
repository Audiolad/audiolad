import type { SupabaseClient } from "@supabase/supabase-js";

import type { CourseContentAccessInput } from "@/lib/products/access";

import {
  canAccessRequiredLevel,
  resolveCourseLearnerAccess,
  type CourseLearnerAccess,
  type CourseLearnerAccessOptions,
} from "./learner-access";
import { normalizeRequiredAccessLevel } from "./learner-dto";
import { isCourseLessonEligibleForStorefrontPreview } from "./storefront-preview";

export type CourseBlockAssociation = {
  blockId: string;
  lessonId: string;
  requiredAccessLevel: number;
};

type LessonAssociationRow = {
  id: string;
  lesson_id: string;
  type: string;
  asset_id: string | null;
};

type LessonLevelRow = {
  id: string;
  publication_id?: string;
  required_access_level: number | null;
};

/**
 * ANY accessible association unlocks a shared asset.
 * Do not use MAX(required_access_level) across lessons.
 */
export function canAccessCourseAssetAssociation(
  access: Pick<
    CourseLearnerAccess,
    "canReadPrivateContent" | "accessLevel" | "privileged"
  >,
  associations: readonly CourseBlockAssociation[],
): boolean {
  if (!access.canReadPrivateContent || associations.length === 0) {
    return false;
  }

  return associations.some((association) =>
    canAccessRequiredLevel(access, association.requiredAccessLevel),
  );
}

export async function loadCourseBlockAssociations(input: {
  serviceRole: SupabaseClient;
  publicationId: string;
  blockType: "audio" | "file";
  assetId: string;
}): Promise<CourseBlockAssociation[]> {
  const { data: blocks, error: blockError } = await input.serviceRole
    .from("course_lesson_blocks")
    .select("id, lesson_id, type, asset_id")
    .eq("type", input.blockType)
    .eq("asset_id", input.assetId);

  if (blockError) {
    throw new Error("course_block_association_lookup_failed");
  }

  const rows = (blocks ?? []) as LessonAssociationRow[];
  if (rows.length === 0) {
    return [];
  }

  const lessonIds = [...new Set(rows.map((row) => row.lesson_id))];
  const { data: lessons, error: lessonError } = await input.serviceRole
    .from("course_lessons")
    .select("id, publication_id, required_access_level")
    .eq("publication_id", input.publicationId)
    .in("id", lessonIds);

  if (lessonError) {
    throw new Error("course_lesson_association_lookup_failed");
  }

  const lessonById = new Map(
    ((lessons ?? []) as LessonLevelRow[]).map((lesson) => [lesson.id, lesson]),
  );

  return rows.flatMap((row) => {
    const lesson = lessonById.get(row.lesson_id);
    if (!lesson || lesson.publication_id !== input.publicationId) {
      return [];
    }

    return [
      {
        blockId: row.id,
        lessonId: lesson.id,
        requiredAccessLevel: normalizeRequiredAccessLevel(
          lesson.required_access_level,
        ),
      },
    ];
  });
}

export async function listAccessibleCourseAudioItemIds(input: {
  serviceRole: SupabaseClient;
  publicationId: string;
  access: CourseLearnerAccess;
}): Promise<Set<string>> {
  if (!input.access.canReadPrivateContent) {
    return new Set();
  }

  const { data: lessons, error: lessonError } = await input.serviceRole
    .from("course_lessons")
    .select("id, required_access_level")
    .eq("publication_id", input.publicationId);

  if (lessonError) {
    throw new Error("course_lessons_lookup_failed");
  }

  const accessibleLessonIds = ((lessons ?? []) as LessonLevelRow[])
    .filter((lesson) =>
      canAccessRequiredLevel(
        input.access,
        normalizeRequiredAccessLevel(lesson.required_access_level),
      ),
    )
    .map((lesson) => lesson.id);

  if (accessibleLessonIds.length === 0) {
    return new Set();
  }

  const { data: blocks, error: blockError } = await input.serviceRole
    .from("course_lesson_blocks")
    .select("asset_id, lesson_id, type")
    .eq("type", "audio")
    .in("lesson_id", accessibleLessonIds);

  if (blockError) {
    throw new Error("course_audio_block_lookup_failed");
  }

  const ids = new Set<string>();
  for (const block of (blocks ?? []) as Array<{ asset_id: string | null }>) {
    const assetId = block.asset_id?.trim();
    if (assetId) {
      ids.add(assetId);
    }
  }

  return ids;
}

/**
 * Audio items attached to Level 1 lessons only.
 * Locked L2 / required_access_level > 1 never enter this set, even if an
 * audio_item is accidentally marked is_preview or has a preview window.
 */
export async function listCourseStorefrontPreviewAudioItemIds(input: {
  serviceRole: SupabaseClient;
  publicationId: string;
}): Promise<Set<string>> {
  const { data: lessons, error: lessonError } = await input.serviceRole
    .from("course_lessons")
    .select("id, required_access_level")
    .eq("publication_id", input.publicationId);

  if (lessonError) {
    throw new Error("course_lessons_lookup_failed");
  }

  const level1LessonIds = ((lessons ?? []) as LessonLevelRow[])
    .filter((lesson) =>
      isCourseLessonEligibleForStorefrontPreview(lesson.required_access_level),
    )
    .map((lesson) => lesson.id);

  if (level1LessonIds.length === 0) {
    return new Set();
  }

  const { data: blocks, error: blockError } = await input.serviceRole
    .from("course_lesson_blocks")
    .select("asset_id, lesson_id, type")
    .eq("type", "audio")
    .in("lesson_id", level1LessonIds);

  if (blockError) {
    throw new Error("course_audio_block_lookup_failed");
  }

  const ids = new Set<string>();
  for (const block of (blocks ?? []) as Array<{ asset_id: string | null }>) {
    const assetId = block.asset_id?.trim();
    if (assetId) {
      ids.add(assetId);
    }
  }

  return ids;
}

export async function canPlayCourseAudioItem(input: {
  supabase: SupabaseClient;
  serviceRole: SupabaseClient;
  practice: CourseContentAccessInput;
  userId: string | null;
  audioItemId: string;
  options?: CourseLearnerAccessOptions;
}): Promise<boolean> {
  const access = await resolveCourseLearnerAccess(
    input.supabase,
    input.practice,
    input.userId,
    input.options,
  );

  if (!access.canReadPrivateContent) {
    return false;
  }

  const associations = await loadCourseBlockAssociations({
    serviceRole: input.serviceRole,
    publicationId: input.practice.id,
    blockType: "audio",
    assetId: input.audioItemId,
  });

  return canAccessCourseAssetAssociation(access, associations);
}

export async function canDownloadCoursePublicationFile(input: {
  supabase: SupabaseClient;
  serviceRole: SupabaseClient;
  practice: CourseContentAccessInput;
  userId: string | null;
  fileId: string;
  options?: CourseLearnerAccessOptions;
}): Promise<boolean> {
  const access = await resolveCourseLearnerAccess(
    input.supabase,
    input.practice,
    input.userId,
    input.options,
  );

  if (!access.canReadPrivateContent) {
    return false;
  }

  const associations = await loadCourseBlockAssociations({
    serviceRole: input.serviceRole,
    publicationId: input.practice.id,
    blockType: "file",
    assetId: input.fileId,
  });

  return canAccessCourseAssetAssociation(access, associations);
}
