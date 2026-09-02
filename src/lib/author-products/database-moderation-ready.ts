/**
 * Read-only TypeScript mirror of public.assert_practice_moderation_ready
 * (latest: supabase/migrations/20260913120000_minimal_product_moderation_readiness.sql).
 *
 * Used by admin support diagnostics so a product is never reported READY
 * when the live submit RPC would fail existing DB validation.
 * This is not a third rule set and does not replace evaluatePublishReadiness.
 */

import {
  authorAccessAllowsContentMutations,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import {
  evaluateCourseLessonsReadiness,
  type CoursePublishContentSnapshot,
} from "@/lib/author-products/course-builder-shared";
import { isAudioPostProductKind } from "@/lib/author-products/product-kind";
import type { AudioItemRow, PracticeRow } from "@/lib/author-products/types";

export type DatabaseModerationReadyCheck = {
  code: string;
  label: string;
  ok: boolean;
  message: string | null;
};

export type DatabaseModerationReadyResult = {
  ok: boolean;
  checks: DatabaseModerationReadyCheck[];
  firstFailure: { code: string; message: string } | null;
};

export type EvaluateDatabaseModerationReadyInput = {
  practice: PracticeRow;
  audioItems: AudioItemRow[];
  accessStatus: AuthorAccessStatus | string | null | undefined;
  activeTopicCount: number;
  courseContent?: CoursePublishContentSnapshot;
};

function check(
  code: string,
  label: string,
  failure: string | null,
): DatabaseModerationReadyCheck {
  return {
    code,
    label,
    ok: !failure,
    message: failure,
  };
}

function summarize(
  checks: DatabaseModerationReadyCheck[],
): DatabaseModerationReadyResult {
  const firstFailed = checks.find((item) => !item.ok);

  return {
    ok: !firstFailed,
    checks,
    firstFailure:
      firstFailed && firstFailed.message
        ? { code: firstFailed.code, message: firstFailed.message }
        : null,
  };
}

/**
 * Known DB-only (or DB-stricter) conditions that evaluatePublishReadiness
 * currently does not enforce the same way.
 */
export function listKnownTsSqlReadinessDivergences(): readonly string[] {
  return [];
}

export function evaluateDatabaseModerationReady(
  input: EvaluateDatabaseModerationReadyInput,
): DatabaseModerationReadyResult {
  const practice = input.practice;
  const isCourse = practice.publication_class === "course";
  const audioCount = input.audioItems.length;
  const courseContentCheck = isCourse
    ? evaluateCourseLessonsReadiness(input.courseContent?.lessons)
    : ({ ok: true } as const);

  const checks: DatabaseModerationReadyCheck[] = [
    check(
      "practice_deleted",
      "Продукт не удалён",
      practice.deleted_at
        ? "Удалённый продукт нельзя отправить на модерацию."
        : null,
    ),
    check(
      "author_content_mutations_blocked",
      "Авторский доступ разрешает изменения",
      !authorAccessAllowsContentMutations(input.accessStatus)
        ? "Изменение и отправка продуктов недоступны при текущем статусе авторского доступа."
        : null,
    ),
    check(
      "missing_title",
      "Название",
      !practice.title?.trim() ? "Укажите название аудиопродукта." : null,
    ),
    check(
      "missing_audio",
      "Аудиозаписи (SQL)",
      !isCourse && audioCount === 0
        ? "База требует хотя бы одну аудиозапись."
        : null,
    ),
    check(
      "audio_post_requires_single_audio",
      "Одна аудиозапись для аудиопоста",
      !isCourse && isAudioPostProductKind(practice.product_kind) && audioCount !== 1
        ? "Для аудиопоста требуется ровно одна аудиозапись."
        : null,
    ),
    check(
      "incomplete_audio",
      "Полнота аудиозаписей",
      !isCourse &&
        input.audioItems.some(
          (item) =>
            !item.audio_path?.trim() ||
            !item.duration_seconds ||
            item.duration_seconds <= 0,
        )
        ? "У одной или нескольких аудиозаписей нет файла или длительности."
        : null,
    ),
  ];

  if (isCourse) {
    checks.push(
      check(
        courseContentCheck.ok ? "course_content" : courseContentCheck.code,
        "Содержание курса (SQL)",
        courseContentCheck.ok ? null : courseContentCheck.message,
      ),
    );
  }

  return summarize(checks);
}

export function isReadyForModerationSubmit(input: {
  tsReady: boolean;
  dbReady: boolean;
}): boolean {
  return input.tsReady && input.dbReady;
}
