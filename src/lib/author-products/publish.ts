import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPublishRpcError } from "@/lib/author-products/moderation";
import { mapTopicRpcError } from "@/lib/topics/errors";

import type { AuthorAccessStatus } from "@/lib/authors/access";
import {
  evaluateCoursePublishContentGate,
  shouldSkipFlatAudioPublishRequirement,
  type CoursePublishContentSnapshot,
} from "@/lib/author-products/course-builder-shared";
import { isCoursePublication } from "@/lib/author-products/publication-class";

import type { AudioItemRow, PracticeRow } from "./types";
import { LEGACY_OTHER_FORMAT } from "./format";
import {
  AUDIO_POST_KIND_LABEL,
  isAudioPostProductKind,
  isMusicProductKind,
  MUSIC_KIND_LABEL,
} from "./product-kind";
import { minutesFromSeconds } from "./utils";

export type PublishValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type PublishReadinessRequirementKey =
  | "author"
  | "title"
  | "audio"
  | "course_content";

export type PublishReadinessRequirement = {
  key: PublishReadinessRequirementKey;
  label: string;
  ok: boolean;
  code: string | null;
  message: string | null;
};

export type PublishReadinessResult = {
  ok: boolean;
  requirements: PublishReadinessRequirement[];
  completedCount: number;
  totalCount: number;
  firstFailure: { code: string; message: string } | null;
};

export type EvaluatePublishReadinessOptions = {
  accessStatus?: AuthorAccessStatus;
  /** Active practice topics; required for the shared publish + onboarding gate. */
  activeTopicCount: number;
  courseContent?: CoursePublishContentSnapshot;
};

function sortAudioItemsByPosition(audioItems: AudioItemRow[]): AudioItemRow[] {
  return [...audioItems].sort((left, right) => left.position - right.position);
}

function requirement(
  key: PublishReadinessRequirementKey,
  label: string,
  failure: { code: string; message: string } | null,
): PublishReadinessRequirement {
  if (!failure) {
    return { key, label, ok: true, code: null, message: null };
  }

  return {
    key,
    label,
    ok: false,
    code: failure.code,
    message: failure.message,
  };
}

function summarizePublishReadiness(
  requirements: PublishReadinessRequirement[],
): PublishReadinessResult {
  const completedCount = requirements.filter((item) => item.ok).length;
  const firstFailed = requirements.find((item) => !item.ok);

  return {
    ok: !firstFailed,
    requirements,
    completedCount,
    totalCount: requirements.length,
    firstFailure:
      firstFailed && firstFailed.code && firstFailed.message
        ? { code: firstFailed.code, message: firstFailed.message }
        : null,
  };
}

export function validateAudioItemsStructure(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
): PublishValidationResult {
  if (isAudioPostProductKind(practice.product_kind) && audioItems.length !== 1) {
    return {
      ok: false,
      code: "audio_post_requires_single_audio",
      message: "Для аудиопоста требуется ровно одна аудиозапись.",
    };
  }

  if (audioItems.length === 0) {
    return {
      ok: false,
      code: "missing_audio",
      message: "Добавьте хотя бы одно аудио.",
    };
  }

  const sorted = sortAudioItemsByPosition(audioItems);
  const positions = sorted.map((item) => item.position);

  if (new Set(positions).size !== positions.length) {
    return {
      ok: false,
      code: "invalid_audio_positions",
      message: "Порядок аудио настроен некорректно. Проверьте позиции треков.",
    };
  }

  for (const [index, item] of sorted.entries()) {
    const expectedPosition = index + 1;

    if (item.position !== expectedPosition) {
      return {
        ok: false,
        code: "invalid_audio_positions",
        message: "Порядок аудио настроен некорректно. Проверьте позиции треков.",
      };
    }

    if (item.practice_id !== practice.id) {
      return {
        ok: false,
        code: "audio_item_mismatch",
        message: "Не удалось подтвердить принадлежность аудио к этому продукту.",
      };
    }

    const audioNumber = index + 1;

    if (!item.audio_path?.trim()) {
      return {
        ok: false,
        code: "missing_audio_file",
        message: `Загрузите MP3-файл для аудио ${audioNumber}.`,
      };
    }

    if (!item.duration_seconds || item.duration_seconds <= 0) {
      return {
        ok: false,
        code: "missing_audio_duration",
        message: `Не удалось определить длительность аудио ${audioNumber}.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Effective format for publish.
 * Music always stores/shows the system label «Музыка» (no author format picker).
 */
export function resolveFormatForPublish(
  practice: Pick<PracticeRow, "format" | "product_kind">,
  audioItems: ReadonlyArray<Pick<AudioItemRow, "id">> = [],
): string | null {
  void audioItems;

  if (isMusicProductKind(practice.product_kind)) {
    return MUSIC_KIND_LABEL;
  }

  if (isAudioPostProductKind(practice.product_kind)) {
    return AUDIO_POST_KIND_LABEL;
  }

  const format = practice.format?.trim() || null;

  if (format && format !== LEGACY_OTHER_FORMAT) {
    return format;
  }

  return format === LEGACY_OTHER_FORMAT ? LEGACY_OTHER_FORMAT : null;
}

function buildCorePublishRequirements(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
  courseContent?: CoursePublishContentSnapshot,
): PublishReadinessRequirement[] {
  const authorFailure = !practice.author_id
    ? {
        code: "missing_author",
        message: "Выберите авторское пространство.",
      }
    : null;

  const titleFailure = !practice.title?.trim()
    ? {
        code: "missing_title",
        message: "Укажите название аудиопродукта.",
      }
    : null;

  const blockCount = courseContent?.blockCount ?? 0;
  const skipFlatAudio = shouldSkipFlatAudioPublishRequirement({
    publicationClass: practice.publication_class,
    productKind: practice.product_kind,
    blockCount,
  });
  const structureValidation = skipFlatAudio
    ? ({ ok: true } as const)
    : validateAudioItemsStructure(practice, audioItems);
  const audioFailure = structureValidation.ok
    ? null
    : {
        code: structureValidation.code,
        message: structureValidation.message,
      };
  const courseContentCheck = evaluateCoursePublishContentGate({
    publicationClass: practice.publication_class,
    productKind: practice.product_kind,
    publishedAt: practice.published_at,
    lessonCount: courseContent?.lessonCount ?? 0,
    blockCount,
    lessons: courseContent?.lessons,
  });
  const courseContentFailure = courseContentCheck.ok
    ? null
    : {
        code: courseContentCheck.code,
        message: courseContentCheck.message,
      };

  const requirements: PublishReadinessRequirement[] = [
    requirement("author", "Авторское пространство", authorFailure),
    requirement("title", "Название", titleFailure),
    requirement("audio", "Аудиозапись", audioFailure),
  ];

  if (isCoursePublication(practice.publication_class, practice.product_kind)) {
    requirements.push(
      requirement("course_content", "Содержание курса", courseContentFailure),
    );
  }

  return requirements;
}

/**
 * Shared structured moderation-readiness for the author dashboard.
 * A non-course product needs only a title and a successfully uploaded audio item.
 */
export function evaluatePublishReadiness(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
  options: EvaluatePublishReadinessOptions,
): PublishReadinessResult {
  return summarizePublishReadiness(
    buildCorePublishRequirements(practice, audioItems, options.courseContent),
  );
}

export function validatePublishRequirements(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
  accessStatus?: AuthorAccessStatus,
  activeTopicCount?: number,
): PublishValidationResult {
  if (typeof activeTopicCount === "number") {
    const readiness = evaluatePublishReadiness(practice, audioItems, {
      accessStatus,
      activeTopicCount,
    });

    if (readiness.ok || !readiness.firstFailure) {
      return { ok: true };
    }

    return {
      ok: false,
      code: readiness.firstFailure.code,
      message: readiness.firstFailure.message,
    };
  }

  // Legacy field/audio/price-only path (topics enforced separately / via RPC).
  const readiness = summarizePublishReadiness(
    buildCorePublishRequirements(practice, audioItems),
  );

  if (readiness.ok || !readiness.firstFailure) {
    return { ok: true };
  }

  return {
    ok: false,
    code: readiness.firstFailure.code,
    message: readiness.firstFailure.message,
  };
}

export async function publishPracticeProduct(
  supabase: SupabaseClient,
  practiceId: string,
  publishedAt: string,
): Promise<void> {
  const { callAuthorUserRpc } = await import("@/lib/author-support/context");
  const { error } = await callAuthorUserRpc(
    supabase,
    "publish_audio_product",
    {
      p_practice_id: practiceId,
      p_published_at: publishedAt,
    },
  );

  if (error) {
    const publishMapped = mapPublishRpcError(error);
    if (publishMapped) {
      throw publishMapped;
    }

    const mapped = mapTopicRpcError(error.message);

    if (mapped.code !== "topic_sync_failed") {
      throw mapped;
    }

    throw new Error("practice_publish_failed");
  }
}

export async function unpublishPracticeProduct(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<void> {
  const { callAuthorUserRpc } = await import("@/lib/author-support/context");
  const { error } = await callAuthorUserRpc(
    supabase,
    "unpublish_approved_practice",
    { p_practice_id: practiceId },
  );

  if (error) {
    const mapped = mapPublishRpcError(error);
    if (mapped) {
      throw mapped;
    }
    throw new Error("practice_unpublish_failed");
  }
}

export async function archivePracticeProduct(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<void> {
  const { error } = await supabase.rpc("archive_audio_product", {
    p_practice_id: practiceId,
  });

  if (error) {
    throw new Error("practice_archive_failed");
  }
}

export async function publishAllAudioItems(
  supabase: SupabaseClient,
  practiceId: string,
  timestamp?: string,
): Promise<void> {
  const now = timestamp ?? new Date().toISOString();

  const { error } = await supabase
    .from("audio_items")
    .update({
      status: "published",
      updated_at: now,
    })
    .eq("practice_id", practiceId);

  if (error) {
    throw new Error("audio_items_publish_failed");
  }
}

export async function syncPracticeAudioCompatibility(
  supabase: SupabaseClient,
  practiceId: string,
) {
  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id, status")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError || !practice?.id) {
    throw new Error("practice_not_found");
  }

  const { data: audioItems, error: audioError } = await supabase
    .from("audio_items")
    .select("id, audio_path, duration_seconds, position")
    .eq("practice_id", practiceId)
    .order("position", { ascending: true });

  if (audioError) {
    throw new Error("audio_items_lookup_failed");
  }

  const sortedItems = [...(audioItems ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  const itemsWithMp3 = sortedItems.filter((item) => item.audio_path?.trim());

  const firstAudioPath = itemsWithMp3[0]?.audio_path?.trim() ?? null;
  const totalDurationSeconds = itemsWithMp3.reduce(
    (sum, item) => sum + (item.duration_seconds ?? 0),
    0,
  );
  const durationMinutes =
    totalDurationSeconds > 0
      ? minutesFromSeconds(totalDurationSeconds)
      : null;

  const { error: updateError } = await supabase
    .from("practices")
    .update({
      audio_url: firstAudioPath,
      duration_minutes: durationMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", practiceId);

  if (updateError) {
    throw new Error("practice_sync_failed");
  }
}

/** @deprecated Use syncPracticeAudioCompatibility */
export const syncSingleAudioCompatibility = syncPracticeAudioCompatibility;
