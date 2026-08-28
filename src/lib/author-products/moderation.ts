import type { SupabaseClient } from "@supabase/supabase-js";

import {
  COURSE_PUBLISH_EMPTY_LESSON_CODE,
  COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE,
  COURSE_PUBLISH_MISSING_FILE_CODE,
  COURSE_PUBLISH_MISSING_LESSONS_CODE,
  COURSE_PUBLISH_MISSING_LESSONS_MESSAGE,
  COURSE_PUBLISH_NOT_READY_FALLBACK,
  formatEmptyCourseLessonMessage,
  formatIncompleteCourseAudioMessage,
  formatMissingCourseFileMessage,
} from "@/lib/author-products/course-builder-shared";
import type { PracticeRow } from "@/lib/author-products/types";
import { hasPermission } from "@/lib/auth/platform-access";

export const MODERATION_STATUS = {
  NOT_SUBMITTED: "not_submitted",
  SUBMITTED: "submitted",
  CHANGES_REQUESTED: "changes_requested",
  APPROVED: "approved",
} as const;

export type ModerationStatus =
  (typeof MODERATION_STATUS)[keyof typeof MODERATION_STATUS];

/** Author-facing product lifecycle label (not raw DB status). */
export const VISIBLE_AUTHOR_PRODUCT_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  CHANGES_REQUESTED: "changes_requested",
  PUBLISHED: "published",
  UNPUBLISHED: "unpublished",
  DELETED: "deleted",
} as const;

export type VisibleAuthorProductStatus =
  (typeof VISIBLE_AUTHOR_PRODUCT_STATUS)[keyof typeof VISIBLE_AUTHOR_PRODUCT_STATUS];

export const PRODUCT_UNDER_MODERATION_MESSAGE =
  "Продукт находится на модерации. Сначала отзовите его, чтобы внести изменения.";

export const PRODUCT_PUBLISHED_IMMUTABLE_MESSAGE =
  "Чтобы изменить опубликованный продукт, сначала выберите «Снять и редактировать».";

export const PRODUCT_APPROVED_UNPUBLISHED_IMMUTABLE_MESSAGE =
  "Чтобы изменить одобренную версию, сначала выберите «Перейти к редактированию». После этого потребуется повторная модерация.";

export type PublishModerationGateResult =
  | { ok: true; canBypass: boolean }
  | {
      ok: false;
      code:
        | "practice_deleted"
        | "moderation_required"
        | "moderation_not_approved_for_republish";
      message: string;
      status: number;
    };

export type VisibleAuthorProductStatusInput = {
  status: string;
  moderationStatus: string | null | undefined;
  deletedAt?: string | null;
};

/**
 * Single mapper from technical fields to author-visible lifecycle status.
 * Used by list cards, form banners, and API helpers — do not duplicate.
 */
export function getVisibleAuthorProductStatus(
  input: VisibleAuthorProductStatusInput,
): VisibleAuthorProductStatus {
  if (input.deletedAt) {
    return VISIBLE_AUTHOR_PRODUCT_STATUS.DELETED;
  }

  if (input.status === "published") {
    return VISIBLE_AUTHOR_PRODUCT_STATUS.PUBLISHED;
  }

  if (input.moderationStatus === MODERATION_STATUS.SUBMITTED) {
    return VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED;
  }

  if (input.moderationStatus === MODERATION_STATUS.CHANGES_REQUESTED) {
    return VISIBLE_AUTHOR_PRODUCT_STATUS.CHANGES_REQUESTED;
  }

  if (
    input.status === "unpublished" &&
    input.moderationStatus === MODERATION_STATUS.APPROVED
  ) {
    return VISIBLE_AUTHOR_PRODUCT_STATUS.UNPUBLISHED;
  }

  return VISIBLE_AUTHOR_PRODUCT_STATUS.DRAFT;
}

export function getVisibleAuthorProductStatusLabel(
  visible: VisibleAuthorProductStatus | string,
): string {
  switch (visible) {
    case VISIBLE_AUTHOR_PRODUCT_STATUS.PUBLISHED:
      return "Опубликован";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.UNPUBLISHED:
      return "Снят с публикации";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED:
      return "На модерации";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.CHANGES_REQUESTED:
      return "Требуются изменения";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.DELETED:
      return "Удалён";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.DRAFT:
    default:
      return "Черновик";
  }
}

export function getVisibleAuthorProductStatusClassName(
  visible: VisibleAuthorProductStatus | string,
): string {
  switch (visible) {
    case VISIBLE_AUTHOR_PRODUCT_STATUS.PUBLISHED:
      return "bg-[#eaf7ef] text-[#3d8d65]";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.UNPUBLISHED:
      return "bg-[#eef3ff] text-[#4f6db8]";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED:
      return "bg-[#eef3ff] text-[#4f6db8]";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.CHANGES_REQUESTED:
      return "bg-[#fff4df] text-[#b67a1d]";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.DELETED:
      return "bg-[#f2f2f7] text-[#6d6d80]";
    case VISIBLE_AUTHOR_PRODUCT_STATUS.DRAFT:
    default:
      return "bg-[#fff4df] text-[#b67a1d]";
  }
}

export function isPracticeUnderModeration(
  moderationStatus: string | null | undefined,
): boolean {
  return moderationStatus === MODERATION_STATUS.SUBMITTED;
}

export function canSubmitPracticeForModeration(input: {
  status: string;
  moderationStatus: string | null | undefined;
  deletedAt?: string | null;
}): boolean {
  if (input.deletedAt) {
    return false;
  }

  if (input.status !== "draft" && input.status !== "unpublished") {
    return false;
  }

  return (
    input.moderationStatus === MODERATION_STATUS.NOT_SUBMITTED ||
    input.moderationStatus === MODERATION_STATUS.CHANGES_REQUESTED ||
    !input.moderationStatus
  );
}

export function canWithdrawPracticeFromModeration(input: {
  moderationStatus: string | null | undefined;
  deletedAt?: string | null;
}): boolean {
  if (input.deletedAt) {
    return false;
  }

  return input.moderationStatus === MODERATION_STATUS.SUBMITTED;
}

export async function getAuthorCanBypassProductModeration(
  supabase: SupabaseClient,
  authorId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("authors")
    .select("can_bypass_product_moderation")
    .eq("id", authorId)
    .maybeSingle();

  if (error) {
    throw new Error("author_bypass_lookup_failed");
  }

  return data?.can_bypass_product_moderation === true;
}

export class PracticeUnderModerationError extends Error {
  readonly code = "practice_under_moderation" as const;
  readonly status = 409;
  readonly userMessage = PRODUCT_UNDER_MODERATION_MESSAGE;

  constructor() {
    super("practice_under_moderation");
    this.name = "PracticeUnderModerationError";
  }
}

export function assertPracticeNotUnderModeration(
  moderationStatus: string | null | undefined,
): void {
  if (isPracticeUnderModeration(moderationStatus)) {
    throw new PracticeUnderModerationError();
  }
}

export class PracticeDeletedError extends Error {
  readonly code = "practice_deleted" as const;
  readonly status = 409;
  readonly userMessage = "Удалённый продукт нельзя изменить.";

  constructor() {
    super("practice_deleted");
    this.name = "PracticeDeletedError";
  }
}

export class PracticePublishedImmutableError extends Error {
  readonly code = "published_content_immutable" as const;
  readonly status = 409;
  readonly userMessage: string;

  constructor(message: string = PRODUCT_PUBLISHED_IMMUTABLE_MESSAGE) {
    super("published_content_immutable");
    this.name = "PracticePublishedImmutableError";
    this.userMessage = message;
  }
}

/**
 * Shared server guard for author mutations of public/moderated product content.
 * Blocks deleted, submitted, published, and approved-unpublished products.
 */
export function assertPracticePublicContentEditable(
  practice: {
    status: string;
    moderation_status?: string | null;
    deleted_at?: string | null;
  },
  options?: { canBypass?: boolean },
): void {
  if (practice.deleted_at) {
    throw new PracticeDeletedError();
  }

  assertPracticeNotUnderModeration(practice.moderation_status);

  if (options?.canBypass) {
    return;
  }

  if (practice.status === "published") {
    throw new PracticePublishedImmutableError(
      PRODUCT_PUBLISHED_IMMUTABLE_MESSAGE,
    );
  }

  if (
    practice.status === "unpublished" &&
    practice.moderation_status === MODERATION_STATUS.APPROVED
  ) {
    throw new PracticePublishedImmutableError(
      PRODUCT_APPROVED_UNPUBLISHED_IMMUTABLE_MESSAGE,
    );
  }
}

export function isPracticePublishedImmutableError(
  error: unknown,
): error is PracticePublishedImmutableError {
  return error instanceof PracticePublishedImmutableError;
}

export function isPracticeDeletedError(
  error: unknown,
): error is PracticeDeletedError {
  return error instanceof PracticeDeletedError;
}

export function isPracticeUnderModerationError(
  error: unknown,
): error is PracticeUnderModerationError {
  return error instanceof PracticeUnderModerationError;
}

export type PublishRpcErrorSource =
  | string
  | {
      message?: string | null;
      details?: string | null;
      hint?: string | null;
    };

export type MapPublishRpcErrorOptions = {
  publicationClass?: string | null;
};

export const AUDIO_FIRST_PUBLISH_NOT_READY_FALLBACK =
  "Продукт ещё не готов к публикации или отправке на модерацию. Проверьте обязательные поля, тему и аудио.";

const PRODUCT_NOT_READY_DETAIL_CODES = [
  "missing_title",
  "missing_description",
  "slug_required",
  "invalid_slug",
  "missing_cover",
  "invalid_currency",
  "invalid_product_kind",
  "invalid_format",
  "music_permission_required",
  "music_permission_not_allowed",
  "audio_post_must_be_free",
  "invalid_price",
  "commercial_eligibility_required",
  "topic_min_required",
  "missing_audio",
  "audio_post_requires_single_audio",
  "incomplete_audio",
  "promo_title_required",
  "promo_text_required",
  "promo_button_text_required",
  "promo_url_required",
  COURSE_PUBLISH_MISSING_LESSONS_CODE,
  COURSE_PUBLISH_EMPTY_LESSON_CODE,
  COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE,
  COURSE_PUBLISH_MISSING_FILE_CODE,
] as const;

const COURSE_PRODUCT_NOT_READY_CODES = new Set<string>([
  COURSE_PUBLISH_MISSING_LESSONS_CODE,
  COURSE_PUBLISH_EMPTY_LESSON_CODE,
  COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE,
  COURSE_PUBLISH_MISSING_FILE_CODE,
]);

export function readPublishRpcErrorParts(source: PublishRpcErrorSource): {
  message: string;
  details: string;
  hint: string;
} {
  if (typeof source === "string") {
    return { message: source, details: "", hint: "" };
  }

  return {
    message: typeof source.message === "string" ? source.message : "",
    details: typeof source.details === "string" ? source.details : "",
    hint: typeof source.hint === "string" ? source.hint : "",
  };
}

function isSafeLessonHint(hint: string): string | null {
  const trimmed = hint.trim();
  if (!trimmed || trimmed.length > 200) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  if (
    upper.includes("SELECT ") ||
    upper.includes("RAISE ") ||
    upper.includes("ERROR") ||
    upper.includes("DETAIL") ||
    trimmed.includes("\n")
  ) {
    return null;
  }

  return trimmed;
}

export function resolveProductNotReadyDetail(
  source: PublishRpcErrorSource,
): string | null {
  const parts = readPublishRpcErrorParts(source);
  const haystack = `${parts.details} ${parts.message}`;

  for (const code of PRODUCT_NOT_READY_DETAIL_CODES) {
    if (parts.details.trim() === code) {
      return code;
    }
  }

  for (const code of PRODUCT_NOT_READY_DETAIL_CODES) {
    if (haystack.includes(code)) {
      return code;
    }
  }

  return null;
}

export function mapProductNotReadyUserMessage(
  source: PublishRpcErrorSource,
  options?: MapPublishRpcErrorOptions,
): { code: string; message: string } {
  const parts = readPublishRpcErrorParts(source);
  const detail = resolveProductNotReadyDetail(source);
  const lessonTitle = isSafeLessonHint(parts.hint);

  switch (detail) {
    case "missing_title":
      return { code: detail, message: "Укажите название аудиопродукта." };
    case "missing_description":
      return { code: detail, message: "Добавьте описание аудиопродукта." };
    case "slug_required":
      return { code: detail, message: "Укажите адрес аудиопродукта." };
    case "invalid_slug":
      return {
        code: detail,
        message:
          "Адрес должен состоять из строчных латинских букв, цифр и дефисов.",
      };
    case "missing_cover":
      return { code: detail, message: "Загрузите обложку аудиопродукта." };
    case "invalid_currency":
      return { code: detail, message: "Валюта продукта должна быть RUB." };
    case "invalid_product_kind":
      return { code: detail, message: "Недопустимый тип продукта." };
    case "invalid_format":
      return { code: detail, message: "Формат не проходит проверку базы данных." };
    case "music_permission_required":
      return {
        code: detail,
        message: "Для музыки нужно выбрать условие использования.",
      };
    case "music_permission_not_allowed":
      return {
        code: detail,
        message:
          "Условия использования музыки нельзя задавать для этого типа продукта.",
      };
    case "audio_post_must_be_free":
      return { code: detail, message: "Аудиопост может быть только бесплатным." };
    case "invalid_price":
      return {
        code: detail,
        message: "Цена не согласована с признаком бесплатности.",
      };
    case "commercial_eligibility_required":
      return {
        code: detail,
        message:
          "Платный продукт нельзя отправить: авторский доступ не разрешает продажи.",
      };
    case "topic_min_required":
      return {
        code: detail,
        message: "Выберите хотя бы одну тему перед отправкой на модерацию.",
      };
    case "missing_audio":
      return { code: detail, message: "Добавьте хотя бы одно аудио." };
    case "audio_post_requires_single_audio":
      return {
        code: detail,
        message: "Для аудиопоста требуется ровно одна аудиозапись.",
      };
    case "incomplete_audio":
      return {
        code: detail,
        message:
          "У одной или нескольких аудиозаписей нет названия, файла или длительности.",
      };
    case "promo_title_required":
      return { code: detail, message: "Укажите заголовок рекомендации." };
    case "promo_text_required":
      return { code: detail, message: "Укажите текст рекомендации." };
    case "promo_button_text_required":
      return { code: detail, message: "Укажите текст кнопки рекомендации." };
    case "promo_url_required":
      return { code: detail, message: "Укажите ссылку рекомендации." };
    case COURSE_PUBLISH_MISSING_LESSONS_CODE:
      return {
        code: detail,
        message: COURSE_PUBLISH_MISSING_LESSONS_MESSAGE,
      };
    case COURSE_PUBLISH_EMPTY_LESSON_CODE:
      return {
        code: detail,
        message: formatEmptyCourseLessonMessage(lessonTitle),
      };
    case COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE:
      return {
        code: detail,
        message: formatIncompleteCourseAudioMessage(lessonTitle),
      };
    case COURSE_PUBLISH_MISSING_FILE_CODE:
      return {
        code: detail,
        message: formatMissingCourseFileMessage(lessonTitle),
      };
    default:
      break;
  }

  const useCourseFallback =
    options?.publicationClass === "course" ||
    (detail != null && COURSE_PRODUCT_NOT_READY_CODES.has(detail));

  return {
    code: detail ?? "product_not_ready",
    message: useCourseFallback
      ? COURSE_PUBLISH_NOT_READY_FALLBACK
      : AUDIO_FIRST_PUBLISH_NOT_READY_FALLBACK,
  };
}

export function mapPublishRpcError(
  source: PublishRpcErrorSource,
  options?: MapPublishRpcErrorOptions,
): {
  status: number;
  code: string;
  message: string;
} | null {
  const parts = readPublishRpcErrorParts(source);
  const normalized = `${parts.message} ${parts.details}`.toLowerCase();

  if (normalized.includes("moderation_required")) {
    return {
      status: 403,
      code: "moderation_required",
      message:
        "Сначала отправьте продукт на модерацию. Публикация станет доступна после одобрения.",
    };
  }

  if (normalized.includes("practice_deleted")) {
    return {
      status: 409,
      code: "practice_deleted",
      message: "Удалённый продукт нельзя опубликовать.",
    };
  }

  if (normalized.includes("product_not_ready")) {
    const mapped = mapProductNotReadyUserMessage(source, options);
    return {
      status: 400,
      code: mapped.code,
      message: mapped.message,
    };
  }

  if (normalized.includes("publication_requires_rpc")) {
    return {
      status: 403,
      code: "publication_requires_rpc",
      message: "Публикация доступна только через серверное действие публикации.",
    };
  }

  if (normalized.includes("moderation_status_locked")) {
    return {
      status: 403,
      code: "moderation_status_locked",
      message: "Статус модерации нельзя изменить напрямую.",
    };
  }

  if (normalized.includes("archive_retired")) {
    return {
      status: 410,
      code: "archive_retired",
      message:
        "Архивация продуктов больше не используется. Снимите продукт с публикации.",
    };
  }

  if (normalized.includes("invalid_status_for_publish")) {
    return {
      status: 400,
      code: "invalid_status_for_publish",
      message: "Текущий статус продукта не позволяет публикацию.",
    };
  }

  if (normalized.includes("invalid_status_for_submit")) {
    return {
      status: 400,
      code: "invalid_status_for_submit",
      message: "В текущем статусе продукт нельзя отправить на модерацию.",
    };
  }

  if (normalized.includes("invalid_moderation_status_for_submit")) {
    return {
      status: 400,
      code: "invalid_moderation_status_for_submit",
      message: "Продукт уже отправлен на модерацию или не готов к повторной отправке.",
    };
  }

  if (normalized.includes("invalid_moderation_status_for_withdraw")) {
    return {
      status: 409,
      code: "invalid_moderation_status_for_withdraw",
      message: "Отозвать можно только продукт, который сейчас на модерации.",
    };
  }

  if (normalized.includes("lifecycle_state_changed")) {
    return {
      status: 409,
      code: "lifecycle_state_changed",
      message:
        "Состояние продукта изменилось. Обновите страницу и повторите действие.",
    };
  }

  if (normalized.includes("published_content_immutable")) {
    return {
      status: 409,
      code: "published_content_immutable",
      message: PRODUCT_PUBLISHED_IMMUTABLE_MESSAGE,
    };
  }

  if (normalized.includes("moderated_content_locked")) {
    return {
      status: 409,
      code: "moderated_content_locked",
      message:
        "Продукт находится на модерации или ожидает повторной публикации. Сначала отзовите его или перейдите в режим редактирования.",
    };
  }

  if (normalized.includes("deletion_metadata_locked")) {
    return {
      status: 403,
      code: "deletion_metadata_locked",
      message: "Удаление продукта возможно только через предусмотренное действие.",
    };
  }

  if (normalized.includes("paid_purchase_exists")) {
    return {
      status: 409,
      code: "paid_purchase_exists",
      message:
        "Удалить этот продукт нельзя, потому что его уже приобрели пользователи. Вы можете снять продукт с публикации – новые покупки прекратятся, а прежние покупатели сохранят доступ.",
    };
  }

  return null;
}

export function mapModerationRpcError(
  source: PublishRpcErrorSource,
  options?: MapPublishRpcErrorOptions,
): {
  status: number;
  code: string;
  message: string;
} {
  const publishMapped = mapPublishRpcError(source, options);
  if (publishMapped) {
    return publishMapped;
  }

  const normalized = readPublishRpcErrorParts(source).message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return {
      status: 401,
      code: "not_authenticated",
      message: "Требуется авторизация.",
    };
  }

  if (normalized.includes("forbidden")) {
    return {
      status: 403,
      code: "forbidden",
      message: "Недостаточно прав для этого действия.",
    };
  }

  if (normalized.includes("practice_not_found")) {
    return {
      status: 404,
      code: "practice_not_found",
      message: "Продукт не найден.",
    };
  }

  if (normalized.includes("author_content_mutations_blocked")) {
    return {
      status: 403,
      code: "author_content_mutations_blocked",
      message: "Изменение продуктов временно недоступно для этого проекта.",
    };
  }

  return {
    status: 500,
    code: "moderation_action_failed",
    message: "Не удалось выполнить действие модерации.",
  };
}
