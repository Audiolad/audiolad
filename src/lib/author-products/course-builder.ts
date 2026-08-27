import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AuthorAccessError,
  requirePracticeAccess,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  assertBlockBelongsToLesson,
  assertLessonBelongsToCourse,
  buildCourseTextBlockPayload,
  defaultCourseLessonTitle,
  nextCoursePosition,
  validateCourseCompletionCtaInput,
  type CourseBuilderAudioAsset,
  type CourseBuilderBlockDto,
  type CourseBuilderFileAsset,
  type CourseBuilderLessonDto,
  type CourseBuilderSnapshot,
  type CourseCompletionCtaDto,
  type CourseCompletionCtaInput,
  type CoursePublishContentSnapshot,
} from "@/lib/author-products/course-builder-shared";
import { assertPracticePublicContentEditableForActor } from "@/lib/author-products/moderation";
import { validatePositionReorderBatch } from "@/lib/author-products/reorder-batch";
import {
  PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
  assertPracticeContentMutable,
} from "@/lib/author-products/sale-lock";
import { removeTrackCoverFiles } from "@/lib/author-products/utils";
import {
  PUBLICATION_FILES_BUCKET,
  buildPublicationFileStoragePath,
  signPublicationFileIfAllowed,
  validateCourseLessonBlock,
  validateCourseParentClass,
  validatePublicationPdfUpload,
  PUBLICATION_FILE_PDF_MIME,
} from "@/lib/course-content";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const LESSON_SELECT =
  "id, publication_id, title, position, created_at, updated_at";
const BLOCK_SELECT =
  "id, lesson_id, type, position, asset_id, payload, created_at, updated_at";
const FILE_SELECT =
  "id, publication_id, storage_path, mime, size_bytes, original_name, created_at, updated_at";
const CTA_SELECT =
  "publication_id, title, description, button_text, url, enabled, created_at, updated_at";
const AUDIO_ASSET_SELECT =
  "id, title, duration_seconds, original_file_name, audio_path";

export class CourseBuilderError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400, message?: string) {
    super(message ?? code);
    this.name = "CourseBuilderError";
    this.code = code;
    this.status = status;
  }
}

export function isCourseBuilderError(
  error: unknown,
): error is CourseBuilderError {
  return error instanceof CourseBuilderError;
}

export async function requireCourseBuilderReadAccess(practiceId: string) {
  const context = await requirePracticeAccess(practiceId);
  assertCoursePublicationClass(context.practice.publication_class);
  return context;
}

export async function requireCourseBuilderMutationAccess(practiceId: string) {
  const context = await requirePracticeMutationAccess(practiceId);
  assertCoursePublicationClass(context.practice.publication_class);
  await assertPracticePublicContentEditableForActor(
    context.supabase,
    context.practice,
    context.user.id,
  );
  return context;
}

function assertCoursePublicationClass(
  publicationClass: string | null | undefined,
) {
  const parent = validateCourseParentClass(publicationClass);

  if (!parent.ok) {
    throw new AuthorAccessError(parent.reason, 403);
  }
}

export async function requireCourseLessonMutationAccess(
  practiceId: string,
  lessonId: string,
) {
  const context = await requireCourseBuilderMutationAccess(practiceId);
  const lesson = await loadCourseLessonRow(context.supabase, lessonId);
  const parent = assertLessonBelongsToCourse({
    lessonPublicationId: lesson?.publication_id,
    courseId: practiceId,
  });

  if (!lesson || !parent.ok) {
    throw new AuthorAccessError("not_found", 404);
  }

  return { ...context, lesson };
}

export async function requireCourseBlockMutationAccess(
  practiceId: string,
  lessonId: string,
  blockId: string,
) {
  const context = await requireCourseLessonMutationAccess(practiceId, lessonId);
  const block = await loadCourseBlockRow(context.supabase, blockId);
  const parent = assertBlockBelongsToLesson({
    blockLessonId: block?.lesson_id,
    lessonId,
  });

  if (!block || !parent.ok) {
    throw new AuthorAccessError("not_found", 404);
  }

  return { ...context, block };
}

type LessonRow = {
  id: string;
  publication_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type BlockRow = {
  id: string;
  lesson_id: string;
  type: "audio" | "text" | "file";
  position: number;
  asset_id: string | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
};

type FileRow = {
  id: string;
  publication_id: string;
  storage_path: string;
  mime: string;
  size_bytes: number;
  original_name: string;
  created_at: string;
  updated_at: string;
};

async function loadCourseLessonRow(
  supabase: SupabaseClient,
  lessonId: string,
): Promise<LessonRow | null> {
  const { data, error } = await supabase
    .from("course_lessons")
    .select(LESSON_SELECT)
    .eq("id", lessonId)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  return (data as LessonRow | null) ?? null;
}

async function loadCourseBlockRow(
  supabase: SupabaseClient,
  blockId: string,
): Promise<BlockRow | null> {
  const { data, error } = await supabase
    .from("course_lesson_blocks")
    .select(BLOCK_SELECT)
    .eq("id", blockId)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  return (data as BlockRow | null) ?? null;
}

export async function countCoursePublishContent(
  supabase: SupabaseClient,
  publicationId: string,
): Promise<CoursePublishContentSnapshot> {
  const { data: lessons, error: lessonError } = await supabase
    .from("course_lessons")
    .select("id")
    .eq("publication_id", publicationId);

  if (lessonError) {
    throw new CourseBuilderError("internal_error", 500);
  }

  const lessonIds = (lessons ?? []).map((row) => row.id as string);

  if (lessonIds.length === 0) {
    return { lessonCount: 0, blockCount: 0 };
  }

  const { count, error: blockError } = await supabase
    .from("course_lesson_blocks")
    .select("id", { count: "exact", head: true })
    .in("lesson_id", lessonIds);

  if (blockError) {
    throw new CourseBuilderError("internal_error", 500);
  }

  return {
    lessonCount: lessonIds.length,
    blockCount: count ?? 0,
  };
}

export async function loadCourseBuilderSnapshot(
  supabase: SupabaseClient,
  publicationId: string,
): Promise<CourseBuilderSnapshot> {
  const { data: lessonRows, error: lessonError } = await supabase
    .from("course_lessons")
    .select(LESSON_SELECT)
    .eq("publication_id", publicationId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  if (lessonError) {
    throw new CourseBuilderError("internal_error", 500);
  }

  const lessons = (lessonRows ?? []) as LessonRow[];
  const lessonIds = lessons.map((lesson) => lesson.id);

  const { data: blockRows, error: blockError } = lessonIds.length
    ? await supabase
        .from("course_lesson_blocks")
        .select(BLOCK_SELECT)
        .in("lesson_id", lessonIds)
        .order("position", { ascending: true })
        .order("id", { ascending: true })
    : { data: [], error: null };

  if (blockError) {
    throw new CourseBuilderError("internal_error", 500);
  }

  const blocks = (blockRows ?? []) as BlockRow[];
  const audioIds = blocks
    .filter((block) => block.type === "audio" && block.asset_id)
    .map((block) => block.asset_id as string);
  const fileIds = blocks
    .filter((block) => block.type === "file" && block.asset_id)
    .map((block) => block.asset_id as string);

  const [audioAssets, fileAssets, cta, orphanCount] = await Promise.all([
    loadAudioAssets(supabase, publicationId, audioIds),
    loadFileAssets(supabase, publicationId, fileIds),
    loadCourseCompletionCta(supabase, publicationId),
    countOrphanAudioItems(supabase, publicationId, blocks),
  ]);

  const blocksByLesson = new Map<string, CourseBuilderBlockDto[]>();

  for (const block of blocks) {
    const dto = toBlockDto(block, audioAssets, fileAssets);
    const list = blocksByLesson.get(block.lesson_id) ?? [];
    list.push(dto);
    blocksByLesson.set(block.lesson_id, list);
  }

  return {
    lessons: lessons.map((lesson) => ({
      ...lesson,
      blocks: blocksByLesson.get(lesson.id) ?? [],
    })),
    completion_cta: cta,
    orphan_audio_item_count: orphanCount,
  };
}

async function loadAudioAssets(
  supabase: SupabaseClient,
  publicationId: string,
  ids: string[],
): Promise<Map<string, CourseBuilderAudioAsset>> {
  const map = new Map<string, CourseBuilderAudioAsset>();

  if (ids.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("audio_items")
    .select(AUDIO_ASSET_SELECT)
    .eq("practice_id", publicationId)
    .in("id", ids);

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  for (const row of data ?? []) {
    map.set(row.id, row as CourseBuilderAudioAsset);
  }

  return map;
}

async function loadFileAssets(
  supabase: SupabaseClient,
  publicationId: string,
  ids: string[],
): Promise<Map<string, CourseBuilderFileAsset>> {
  const map = new Map<string, CourseBuilderFileAsset>();

  if (ids.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("publication_files")
    .select("id, original_name, size_bytes, mime")
    .eq("publication_id", publicationId)
    .in("id", ids);

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  for (const row of data ?? []) {
    map.set(row.id, row as CourseBuilderFileAsset);
  }

  return map;
}

async function countOrphanAudioItems(
  supabase: SupabaseClient,
  publicationId: string,
  blocks: readonly BlockRow[],
): Promise<number> {
  const referenced = new Set(
    blocks
      .filter((block) => block.type === "audio" && block.asset_id)
      .map((block) => block.asset_id as string),
  );

  const { data, error } = await supabase
    .from("audio_items")
    .select("id")
    .eq("practice_id", publicationId);

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  return (data ?? []).filter((row) => !referenced.has(row.id)).length;
}

function toBlockDto(
  block: BlockRow,
  audioAssets: Map<string, CourseBuilderAudioAsset>,
  fileAssets: Map<string, CourseBuilderFileAsset>,
): CourseBuilderBlockDto {
  return {
    ...block,
    audio:
      block.type === "audio" && block.asset_id
        ? (audioAssets.get(block.asset_id) ?? null)
        : null,
    file:
      block.type === "file" && block.asset_id
        ? (fileAssets.get(block.asset_id) ?? null)
        : null,
  };
}

export async function createCourseLesson(
  supabase: SupabaseClient,
  publicationId: string,
  title?: string | null,
): Promise<CourseBuilderLessonDto> {
  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const resolvedTitle =
    title?.trim() || defaultCourseLessonTitle(snapshot.lessons.length);

  if (!resolvedTitle) {
    throw new CourseBuilderError("missing_title", 400);
  }

  const { data, error } = await supabase
    .from("course_lessons")
    .insert({
      publication_id: publicationId,
      title: resolvedTitle,
      position: nextCoursePosition(snapshot.lessons),
    })
    .select(LESSON_SELECT)
    .single();

  if (error || !data) {
    console.error("author_course_lesson_create_error", error?.message);
    throw new CourseBuilderError("internal_error", 500);
  }

  return { ...(data as LessonRow), blocks: [] };
}

export async function updateCourseLessonTitle(
  supabase: SupabaseClient,
  publicationId: string,
  lessonId: string,
  title: string,
): Promise<CourseBuilderLessonDto> {
  const trimmed = title.trim();

  if (!trimmed) {
    throw new CourseBuilderError("missing_title", 400);
  }

  const { data, error } = await supabase
    .from("course_lessons")
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq("id", lessonId)
    .eq("publication_id", publicationId)
    .select(LESSON_SELECT)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  if (!data) {
    throw new AuthorAccessError("not_found", 404);
  }

  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const lesson = snapshot.lessons.find((item) => item.id === lessonId);

  if (!lesson) {
    throw new AuthorAccessError("not_found", 404);
  }

  return lesson;
}

export async function deleteCourseLesson(
  supabase: SupabaseClient,
  publicationId: string,
  lessonId: string,
): Promise<CourseBuilderSnapshot> {
  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const lesson = snapshot.lessons.find((item) => item.id === lessonId);

  if (!lesson) {
    throw new AuthorAccessError("not_found", 404);
  }

  const ownedAudioIds = lesson.blocks
    .filter((block) => block.type === "audio" && block.asset_id)
    .map((block) => block.asset_id as string);
  const ownedFileIds = lesson.blocks
    .filter((block) => block.type === "file" && block.asset_id)
    .map((block) => block.asset_id as string);

  if (ownedAudioIds.length > 0) {
    await assertPracticeContentMutable(
      createServiceRoleClient(),
      publicationId,
      PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
    );
  }

  const { error } = await supabase
    .from("course_lessons")
    .delete()
    .eq("id", lessonId)
    .eq("publication_id", publicationId);

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  await cleanupUnusedCourseAssets(supabase, publicationId, {
    audioIds: ownedAudioIds,
    fileIds: ownedFileIds,
  });

  return loadCourseBuilderSnapshot(supabase, publicationId);
}

export async function reorderCourseLessons(
  supabase: SupabaseClient,
  publicationId: string,
  items: ReadonlyArray<{ id: string; position: number }>,
): Promise<CourseBuilderSnapshot> {
  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const validated = validatePositionReorderBatch(
    snapshot.lessons.map((lesson) => lesson.id),
    items,
  );

  if (!validated.ok) {
    throw new CourseBuilderError("invalid_reorder", 400);
  }

  for (const item of validated.ordered) {
    const { error } = await supabase
      .from("course_lessons")
      .update({ position: item.position, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("publication_id", publicationId);

    if (error) {
      throw new CourseBuilderError("internal_error", 500);
    }
  }

  return loadCourseBuilderSnapshot(supabase, publicationId);
}

export async function createCourseLessonBlock(
  supabase: SupabaseClient,
  publicationId: string,
  lessonId: string,
  input: {
    type: string;
    payload?: unknown;
    file?: File;
  },
): Promise<CourseBuilderBlockDto> {
  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const lesson = snapshot.lessons.find((item) => item.id === lessonId);

  if (!lesson) {
    throw new AuthorAccessError("not_found", 404);
  }

  const position = nextCoursePosition(lesson.blocks);

  if (input.type === "text") {
    const built = buildCourseTextBlockPayload(
      input.payload &&
        typeof input.payload === "object" &&
        !Array.isArray(input.payload)
        ? (input.payload as { text?: unknown }).text
        : undefined,
    );

    if (!built.ok) {
      throw new CourseBuilderError("empty_text", 400);
    }

    const payload = built.payload;
    const validation = validateCourseLessonBlock({
      type: "text",
      assetId: null,
      payload,
    });

    if (!validation.ok) {
      throw new CourseBuilderError("invalid_request", 400);
    }

    return insertBlock(supabase, {
      lessonId,
      type: "text",
      position,
      assetId: null,
      payload,
      publicationId,
    });
  }

  if (input.type === "audio") {
    const audioItem = await createCourseAudioItem(supabase, publicationId);
    const validation = validateCourseLessonBlock({
      type: "audio",
      assetId: audioItem.id,
      payload: {},
    });

    if (!validation.ok) {
      throw new CourseBuilderError("invalid_request", 400);
    }

    return insertBlock(supabase, {
      lessonId,
      type: "audio",
      position,
      assetId: audioItem.id,
      payload: {},
      publicationId,
      audio: audioItem,
    });
  }

  if (input.type === "file") {
    if (!(input.file instanceof File)) {
      throw new CourseBuilderError("invalid_request", 400);
    }

    const fileRow = await createPublicationPdf(supabase, publicationId, input.file);
    const payload = {
      filename: fileRow.original_name,
      mime: fileRow.mime,
      size: fileRow.size_bytes,
    };
    const validation = validateCourseLessonBlock({
      type: "file",
      assetId: fileRow.id,
      payload,
    });

    if (!validation.ok) {
      throw new CourseBuilderError("invalid_request", 400);
    }

    return insertBlock(supabase, {
      lessonId,
      type: "file",
      position,
      assetId: fileRow.id,
      payload,
      publicationId,
      file: {
        id: fileRow.id,
        original_name: fileRow.original_name,
        size_bytes: fileRow.size_bytes,
        mime: fileRow.mime,
      },
    });
  }

  throw new CourseBuilderError("invalid_request", 400);
}

async function insertBlock(
  supabase: SupabaseClient,
  input: {
    lessonId: string;
    type: "audio" | "text" | "file";
    position: number;
    assetId: string | null;
    payload: unknown;
    publicationId: string;
    audio?: CourseBuilderAudioAsset;
    file?: CourseBuilderFileAsset;
  },
): Promise<CourseBuilderBlockDto> {
  const { data, error } = await supabase
    .from("course_lesson_blocks")
    .insert({
      lesson_id: input.lessonId,
      type: input.type,
      position: input.position,
      asset_id: input.assetId,
      payload: input.payload,
    })
    .select(BLOCK_SELECT)
    .single();

  if (error || !data) {
    console.error("author_course_block_create_error", error?.message);
    throw new CourseBuilderError("internal_error", 500);
  }

  return {
    ...(data as BlockRow),
    audio: input.audio ?? null,
    file: input.file ?? null,
  };
}

async function createCourseAudioItem(
  supabase: SupabaseClient,
  publicationId: string,
): Promise<CourseBuilderAudioAsset> {
  const { data: existing, error: existingError } = await supabase
    .from("audio_items")
    .select("position")
    .eq("practice_id", publicationId)
    .order("position", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new CourseBuilderError("internal_error", 500);
  }

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;
  const { data, error } = await supabase
    .from("audio_items")
    .insert({
      practice_id: publicationId,
      title: `Аудио ${nextPosition}`,
      position: nextPosition,
      status: "draft",
    })
    .select(AUDIO_ASSET_SELECT)
    .single();

  if (error || !data) {
    throw new CourseBuilderError("internal_error", 500);
  }

  return data as CourseBuilderAudioAsset;
}

export async function updateCourseLessonBlock(
  supabase: SupabaseClient,
  publicationId: string,
  lessonId: string,
  blockId: string,
  input: {
    payload?: unknown;
    title?: string;
    file?: File;
  },
): Promise<CourseBuilderBlockDto> {
  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const lesson = snapshot.lessons.find((item) => item.id === lessonId);
  const block = lesson?.blocks.find((item) => item.id === blockId);

  if (!lesson || !block) {
    throw new AuthorAccessError("not_found", 404);
  }

  if (block.type === "text" && input.payload !== undefined) {
    const built = buildCourseTextBlockPayload(
      input.payload &&
        typeof input.payload === "object" &&
        !Array.isArray(input.payload)
        ? (input.payload as { text?: unknown }).text
        : undefined,
    );

    if (!built.ok) {
      throw new CourseBuilderError("empty_text", 400);
    }

    const payload = built.payload;
    const validation = validateCourseLessonBlock({
      type: "text",
      assetId: null,
      payload,
    });

    if (!validation.ok) {
      throw new CourseBuilderError("invalid_request", 400);
    }

    return patchBlock(supabase, blockId, lessonId, { payload });
  }

  if (block.type === "audio" && typeof input.title === "string") {
    const title = input.title.trim();

    if (!title || !block.asset_id) {
      throw new CourseBuilderError("invalid_request", 400);
    }

    const { error } = await supabase
      .from("audio_items")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", block.asset_id)
      .eq("practice_id", publicationId);

    if (error) {
      throw new CourseBuilderError("internal_error", 500);
    }

    const next = await loadCourseBuilderSnapshot(supabase, publicationId);
    const updated = next.lessons
      .find((item) => item.id === lessonId)
      ?.blocks.find((item) => item.id === blockId);

    if (!updated) {
      throw new AuthorAccessError("not_found", 404);
    }

    return updated;
  }

  if (block.type === "file" && input.file instanceof File) {
    if (!block.asset_id) {
      throw new CourseBuilderError("invalid_request", 400);
    }

    const replaced = await replacePublicationPdf(
      supabase,
      publicationId,
      block.asset_id,
      input.file,
    );
    const payload = {
      filename: replaced.original_name,
      mime: replaced.mime,
      size: replaced.size_bytes,
    };

    return patchBlock(supabase, blockId, lessonId, { payload }, {
      file: {
        id: replaced.id,
        original_name: replaced.original_name,
        size_bytes: replaced.size_bytes,
        mime: replaced.mime,
      },
    });
  }

  throw new CourseBuilderError("invalid_request", 400);
}

async function patchBlock(
  supabase: SupabaseClient,
  blockId: string,
  lessonId: string,
  updates: Record<string, unknown>,
  extras?: { file?: CourseBuilderFileAsset; audio?: CourseBuilderAudioAsset },
): Promise<CourseBuilderBlockDto> {
  const { data, error } = await supabase
    .from("course_lesson_blocks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", blockId)
    .eq("lesson_id", lessonId)
    .select(BLOCK_SELECT)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  if (!data) {
    throw new AuthorAccessError("not_found", 404);
  }

  return {
    ...(data as BlockRow),
    audio: extras?.audio ?? null,
    file: extras?.file ?? null,
  };
}

export async function deleteCourseLessonBlock(
  supabase: SupabaseClient,
  publicationId: string,
  lessonId: string,
  blockId: string,
): Promise<CourseBuilderSnapshot> {
  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const lesson = snapshot.lessons.find((item) => item.id === lessonId);
  const block = lesson?.blocks.find((item) => item.id === blockId);

  if (!lesson || !block) {
    throw new AuthorAccessError("not_found", 404);
  }

  if (block.type === "audio" && block.asset_id) {
    await assertPracticeContentMutable(
      createServiceRoleClient(),
      publicationId,
      PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
    );
  }

  const { error } = await supabase
    .from("course_lesson_blocks")
    .delete()
    .eq("id", blockId)
    .eq("lesson_id", lessonId);

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  await cleanupUnusedCourseAssets(supabase, publicationId, {
    audioIds: block.type === "audio" && block.asset_id ? [block.asset_id] : [],
    fileIds: block.type === "file" && block.asset_id ? [block.asset_id] : [],
  });

  return loadCourseBuilderSnapshot(supabase, publicationId);
}

export async function reorderCourseLessonBlocks(
  supabase: SupabaseClient,
  publicationId: string,
  lessonId: string,
  items: ReadonlyArray<{ id: string; position: number }>,
): Promise<CourseBuilderLessonDto> {
  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const lesson = snapshot.lessons.find((item) => item.id === lessonId);

  if (!lesson) {
    throw new AuthorAccessError("not_found", 404);
  }

  const validated = validatePositionReorderBatch(
    lesson.blocks.map((block) => block.id),
    items,
  );

  if (!validated.ok) {
    throw new CourseBuilderError("invalid_reorder", 400);
  }

  for (const item of validated.ordered) {
    const { error } = await supabase
      .from("course_lesson_blocks")
      .update({ position: item.position, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("lesson_id", lessonId);

    if (error) {
      throw new CourseBuilderError("internal_error", 500);
    }
  }

  const next = await loadCourseBuilderSnapshot(supabase, publicationId);
  const updated = next.lessons.find((item) => item.id === lessonId);

  if (!updated) {
    throw new AuthorAccessError("not_found", 404);
  }

  return updated;
}

async function cleanupUnusedCourseAssets(
  supabase: SupabaseClient,
  publicationId: string,
  owned: { audioIds: string[]; fileIds: string[] },
) {
  if (owned.audioIds.length === 0 && owned.fileIds.length === 0) {
    return;
  }

  const snapshot = await loadCourseBuilderSnapshot(supabase, publicationId);
  const referencedAudio = new Set<string>();
  const referencedFiles = new Set<string>();

  for (const lesson of snapshot.lessons) {
    for (const block of lesson.blocks) {
      if (block.type === "audio" && block.asset_id) {
        referencedAudio.add(block.asset_id);
      }

      if (block.type === "file" && block.asset_id) {
        referencedFiles.add(block.asset_id);
      }
    }
  }

  for (const audioId of owned.audioIds) {
    if (referencedAudio.has(audioId)) {
      continue;
    }

    await deleteUnreferencedAudioItem(supabase, publicationId, audioId);
  }

  for (const fileId of owned.fileIds) {
    if (referencedFiles.has(fileId)) {
      continue;
    }

    await deleteUnreferencedPublicationFile(supabase, publicationId, fileId);
  }
}

async function deleteUnreferencedAudioItem(
  supabase: SupabaseClient,
  publicationId: string,
  audioId: string,
) {
  const { data, error } = await supabase
    .from("audio_items")
    .select("id, audio_path")
    .eq("id", audioId)
    .eq("practice_id", publicationId)
    .maybeSingle();

  if (error || !data) {
    return;
  }

  if (data.audio_path) {
    await supabase.storage.from("practice-audio").remove([data.audio_path]);
  }

  await removeTrackCoverFiles(supabase, publicationId, audioId);
  await supabase
    .from("audio_items")
    .delete()
    .eq("id", audioId)
    .eq("practice_id", publicationId);
}

async function deleteUnreferencedPublicationFile(
  supabase: SupabaseClient,
  publicationId: string,
  fileId: string,
) {
  const { data, error } = await supabase
    .from("publication_files")
    .select(FILE_SELECT)
    .eq("id", fileId)
    .eq("publication_id", publicationId)
    .maybeSingle();

  if (error || !data) {
    return;
  }

  const file = data as FileRow;
  const service = createServiceRoleClient();
  await service.storage
    .from(PUBLICATION_FILES_BUCKET)
    .remove([file.storage_path]);
  await supabase
    .from("publication_files")
    .delete()
    .eq("id", fileId)
    .eq("publication_id", publicationId);
}

async function createPublicationPdf(
  supabase: SupabaseClient,
  publicationId: string,
  file: File,
): Promise<FileRow> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validatePublicationPdfUpload({ file, buffer });

  if (!validation.ok) {
    throw new CourseBuilderError(validation.code, 400);
  }

  const fileId = randomUUID();
  const storagePath = buildPublicationFileStoragePath(publicationId, fileId);
  const service = createServiceRoleClient();
  const { error: uploadError } = await service.storage
    .from(PUBLICATION_FILES_BUCKET)
    .upload(storagePath, buffer, {
      contentType: PUBLICATION_FILE_PDF_MIME,
      upsert: false,
    });

  if (uploadError) {
    console.error("author_course_pdf_upload_error", uploadError.message);
    throw new CourseBuilderError("internal_error", 500);
  }

  const { data, error } = await supabase
    .from("publication_files")
    .insert({
      id: fileId,
      publication_id: publicationId,
      storage_path: storagePath,
      mime: PUBLICATION_FILE_PDF_MIME,
      size_bytes: buffer.length,
      original_name: file.name.trim() || "material.pdf",
    })
    .select(FILE_SELECT)
    .single();

  if (error || !data) {
    await service.storage.from(PUBLICATION_FILES_BUCKET).remove([storagePath]);
    throw new CourseBuilderError("internal_error", 500);
  }

  return data as FileRow;
}

async function replacePublicationPdf(
  supabase: SupabaseClient,
  publicationId: string,
  fileId: string,
  file: File,
): Promise<FileRow> {
  const { data: existing, error: lookupError } = await supabase
    .from("publication_files")
    .select(FILE_SELECT)
    .eq("id", fileId)
    .eq("publication_id", publicationId)
    .maybeSingle();

  if (lookupError) {
    throw new CourseBuilderError("internal_error", 500);
  }

  if (!existing) {
    throw new AuthorAccessError("not_found", 404);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validatePublicationPdfUpload({ file, buffer });

  if (!validation.ok) {
    throw new CourseBuilderError(validation.code, 400);
  }

  const current = existing as FileRow;
  const storagePath = current.storage_path || buildPublicationFileStoragePath(
    publicationId,
    fileId,
  );
  const service = createServiceRoleClient();
  const { error: uploadError } = await service.storage
    .from(PUBLICATION_FILES_BUCKET)
    .upload(storagePath, buffer, {
      contentType: PUBLICATION_FILE_PDF_MIME,
      upsert: true,
    });

  if (uploadError) {
    throw new CourseBuilderError("internal_error", 500);
  }

  const { data, error } = await supabase
    .from("publication_files")
    .update({
      storage_path: storagePath,
      mime: PUBLICATION_FILE_PDF_MIME,
      size_bytes: buffer.length,
      original_name: file.name.trim() || current.original_name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .eq("publication_id", publicationId)
    .select(FILE_SELECT)
    .maybeSingle();

  if (error || !data) {
    throw new CourseBuilderError("internal_error", 500);
  }

  return data as FileRow;
}

export async function signAuthorPublicationFile(
  supabase: SupabaseClient,
  publicationId: string,
  fileId: string,
): Promise<{ url: string; expiresIn: number; original_name: string; size_bytes: number }> {
  const { data, error } = await supabase
    .from("publication_files")
    .select(FILE_SELECT)
    .eq("id", fileId)
    .eq("publication_id", publicationId)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  if (!data) {
    throw new AuthorAccessError("not_found", 404);
  }

  const file = data as FileRow;
  const service = createServiceRoleClient();
  const signed = await signPublicationFileIfAllowed({
    allowed: true,
    storagePath: file.storage_path,
    sign: async (bucket, path, ttlSeconds) => {
      const result = await service.storage
        .from(bucket)
        .createSignedUrl(path, ttlSeconds);
      return { signedUrl: result.data?.signedUrl };
    },
  });

  if (!signed.ok) {
    throw new CourseBuilderError("preview_failed", 500);
  }

  return {
    url: signed.url,
    expiresIn: signed.expiresIn,
    original_name: file.original_name,
    size_bytes: file.size_bytes,
  };
}

export async function loadCourseCompletionCta(
  supabase: SupabaseClient,
  publicationId: string,
): Promise<CourseCompletionCtaDto | null> {
  const { data, error } = await supabase
    .from("course_completion_ctas")
    .select(CTA_SELECT)
    .eq("publication_id", publicationId)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError("internal_error", 500);
  }

  return (data as CourseCompletionCtaDto | null) ?? null;
}

export async function upsertCourseCompletionCta(
  supabase: SupabaseClient,
  publicationId: string,
  body: unknown,
): Promise<CourseCompletionCtaDto> {
  const parsed = validateCourseCompletionCtaInput(body);

  if (!parsed.ok) {
    throw new CourseBuilderError("invalid_request", 400);
  }

  return saveCourseCompletionCta(supabase, publicationId, parsed.value);
}

export async function saveCourseCompletionCta(
  supabase: SupabaseClient,
  publicationId: string,
  input: CourseCompletionCtaInput,
): Promise<CourseCompletionCtaDto> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("course_completion_ctas")
    .upsert(
      {
        publication_id: publicationId,
        title: input.title,
        description: input.description,
        button_text: input.button_text,
        url: input.url,
        enabled: input.enabled,
        updated_at: now,
      },
      { onConflict: "publication_id" },
    )
    .select(CTA_SELECT)
    .single();

  if (error || !data) {
    console.error("author_course_cta_upsert_error", error?.message);
    throw new CourseBuilderError("internal_error", 500);
  }

  return data as CourseCompletionCtaDto;
}
