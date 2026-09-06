import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ACCESS_LEVELS_ALREADY_CONFIGURED_CODE,
  ACCESS_LEVELS_ALREADY_CONFIGURED_MESSAGE,
  ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE,
  ACCESS_LEVELS_BOOTSTRAP_REQUIRED_MESSAGE,
  ACCESS_LEVEL_NOT_FOUND_CODE,
  ACCESS_LEVEL_NOT_FOUND_MESSAGE,
  evaluateAccessLevelDelete,
  evaluateLessonLevelChange,
  isConfiguredAccessLevel,
  INVALID_REQUIRED_ACCESS_LEVEL_MESSAGE,
  LESSON_LEVEL_NOT_CONFIGURED_CODE,
  LESSON_LEVEL_NOT_CONFIGURED_MESSAGE,
  nextAccessLevel,
  parseRequiredAccessLevelWrite,
  type AccessLevelWriteInput,
  type CourseBuilderAccessLevelDto,
} from "@/lib/author-products/course-access-levels-shared";
import { CourseBuilderError } from "@/lib/author-products/course-builder-shared";
import { getPracticeSaleLock } from "@/lib/author-products/sale-lock";

export const ACCESS_LEVEL_SELECT =
  "id, practice_id, level, title, description, upgrade_price, currency, created_at, updated_at";

export async function loadPracticeAccessLevels(
  client: SupabaseClient,
  practiceId: string,
): Promise<CourseBuilderAccessLevelDto[]> {
  const { data, error } = await client
    .from("practice_access_levels")
    .select(ACCESS_LEVEL_SELECT)
    .eq("practice_id", practiceId)
    .order("level", { ascending: true });

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  return (data ?? []) as CourseBuilderAccessLevelDto[];
}

export async function createInitialCourseAccessLevels(
  service: SupabaseClient,
  practiceId: string,
  input: { level1: AccessLevelWriteInput; level2: AccessLevelWriteInput },
): Promise<CourseBuilderAccessLevelDto[]> {
  const existing = await loadPracticeAccessLevels(service, practiceId);

  if (existing.length > 0) {
    throw new CourseBuilderError(
      ACCESS_LEVELS_ALREADY_CONFIGURED_CODE,
      409,
      ACCESS_LEVELS_ALREADY_CONFIGURED_MESSAGE,
    );
  }

  const { data, error } = await service
    .from("practice_access_levels")
    .insert([
      {
        practice_id: practiceId,
        level: 1,
        title: input.level1.title,
        description: input.level1.description,
        upgrade_price: null,
        currency: "RUB",
      },
      {
        practice_id: practiceId,
        level: 2,
        title: input.level2.title,
        description: input.level2.description,
        upgrade_price: input.level2.upgrade_price,
        currency: "RUB",
      },
    ])
    .select(ACCESS_LEVEL_SELECT)
    .order("level", { ascending: true });

  if (error || !data || data.length !== 2) {
    console.error("author_course_access_levels_bootstrap_error", error?.message);
    throw new CourseBuilderError("internal_error", 500);
  }

  return data as CourseBuilderAccessLevelDto[];
}

export async function appendCourseAccessLevel(
  service: SupabaseClient,
  practiceId: string,
  input: AccessLevelWriteInput,
): Promise<CourseBuilderAccessLevelDto> {
  const existing = await loadPracticeAccessLevels(service, practiceId);

  if (existing.length === 0) {
    throw new CourseBuilderError(
      ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE,
      400,
      ACCESS_LEVELS_BOOTSTRAP_REQUIRED_MESSAGE,
    );
  }

  const level = nextAccessLevel(existing);
  const { data, error } = await service
    .from("practice_access_levels")
    .insert({
      practice_id: practiceId,
      level,
      title: input.title,
      description: input.description,
      upgrade_price: input.upgrade_price,
      currency: "RUB",
    })
    .select(ACCESS_LEVEL_SELECT)
    .single();

  if (error || !data) {
    console.error("author_course_access_level_append_error", error?.message);
    throw new CourseBuilderError("internal_error", 500);
  }

  return data as CourseBuilderAccessLevelDto;
}

export async function updateCourseAccessLevel(
  service: SupabaseClient,
  practiceId: string,
  level: number,
  input: AccessLevelWriteInput,
): Promise<CourseBuilderAccessLevelDto> {
  const existing = await loadPracticeAccessLevels(service, practiceId);
  const current = existing.find((item) => item.level === level);

  if (!current) {
    throw new CourseBuilderError(
      ACCESS_LEVEL_NOT_FOUND_CODE,
      404,
      ACCESS_LEVEL_NOT_FOUND_MESSAGE,
    );
  }

  const { data, error } = await service
    .from("practice_access_levels")
    .update({
      title: input.title,
      description: input.description,
      upgrade_price: level <= 1 ? null : input.upgrade_price,
    })
    .eq("practice_id", practiceId)
    .eq("level", level)
    .select(ACCESS_LEVEL_SELECT)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  if (!data) {
    throw new CourseBuilderError(
      ACCESS_LEVEL_NOT_FOUND_CODE,
      404,
      ACCESS_LEVEL_NOT_FOUND_MESSAGE,
    );
  }

  return data as CourseBuilderAccessLevelDto;
}

export async function deleteCourseAccessLevel(
  service: SupabaseClient,
  practiceId: string,
  level: number,
): Promise<void> {
  const existing = await loadPracticeAccessLevels(service, practiceId);
  const current = existing.find((item) => item.level === level);

  if (!current) {
    throw new CourseBuilderError(
      ACCESS_LEVEL_NOT_FOUND_CODE,
      404,
      ACCESS_LEVEL_NOT_FOUND_MESSAGE,
    );
  }

  const maxLevel = Math.max(...existing.map((item) => item.level));

  const [{ count: lessonCount, error: lessonError }, { count: entitlementCount, error: entitlementError }] =
    await Promise.all([
      service
        .from("course_lessons")
        .select("id", { count: "exact", head: true })
        .eq("publication_id", practiceId)
        .eq("required_access_level", level),
      service
        .from("user_practices")
        .select("id", { count: "exact", head: true })
        .eq("practice_id", practiceId)
        .gte("access_level", level),
    ]);

  if (lessonError || entitlementError) {
    throw new CourseBuilderError("internal_error", 500);
  }

  const allowed = evaluateAccessLevelDelete({
    level,
    maxLevel,
    lessonCountAtLevel: lessonCount ?? 0,
    entitlementCountAtOrAbove: entitlementCount ?? 0,
  });

  if (!allowed.ok) {
    throw new CourseBuilderError(allowed.code, allowed.status, allowed.message);
  }

  const { error } = await service
    .from("practice_access_levels")
    .delete()
    .eq("practice_id", practiceId)
    .eq("level", level);

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }
}

export async function assertLessonRequiredLevelAssignable(input: {
  accessLevels: ReadonlyArray<{ level: number }>;
  requiredAccessLevel: number;
}): Promise<void> {
  if (!isConfiguredAccessLevel(input.accessLevels, input.requiredAccessLevel)) {
    throw new CourseBuilderError(
      LESSON_LEVEL_NOT_CONFIGURED_CODE,
      400,
      LESSON_LEVEL_NOT_CONFIGURED_MESSAGE,
    );
  }
}

export async function assertLessonRequiredLevelChangeAllowed(input: {
  service: SupabaseClient;
  practiceId: string;
  currentLevel: number;
  nextLevel: number;
}): Promise<void> {
  if (input.nextLevel <= input.currentLevel) {
    return;
  }

  const lock = await getPracticeSaleLock(input.service, input.practiceId);
  const allowed = evaluateLessonLevelChange({
    currentLevel: input.currentLevel,
    nextLevel: input.nextLevel,
    saleLocked: lock.locked,
  });

  if (!allowed.ok) {
    throw new CourseBuilderError(allowed.code, 409, allowed.message);
  }
}

export function resolveLessonRequiredAccessLevelInput(
  body: unknown,
  fallback = 1,
): number {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fallback;
  }

  const record = body as Record<string, unknown>;
  const present =
    "requiredAccessLevel" in record || "required_access_level" in record;

  if (!present) {
    return fallback;
  }

  const parsed = parseRequiredAccessLevelWrite(
    "requiredAccessLevel" in record
      ? record.requiredAccessLevel
      : record.required_access_level,
  );

  if (!parsed.ok) {
    throw new CourseBuilderError(
      parsed.reason,
      400,
      INVALID_REQUIRED_ACCESS_LEVEL_MESSAGE,
    );
  }

  return parsed.value;
}
