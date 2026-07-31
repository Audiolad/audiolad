import type { SupabaseClient } from "@supabase/supabase-js";

import type { PracticeRow } from "@/lib/author-products/types";

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

/**
 * Server-side gate before calling publish_audio_product.
 * DB trigger + RPC remain the source of truth; this blocks the old API early.
 */
export async function assertPublishModerationAllowed(
  supabase: SupabaseClient,
  practice: Pick<
    PracticeRow,
    "id" | "author_id" | "status" | "moderation_status" | "deleted_at"
  >,
): Promise<PublishModerationGateResult> {
  if (practice.deleted_at) {
    return {
      ok: false,
      code: "practice_deleted",
      message: "Удалённый продукт нельзя опубликовать.",
      status: 409,
    };
  }

  const canBypass = await getAuthorCanBypassProductModeration(
    supabase,
    practice.author_id,
  );

  if (canBypass) {
    return { ok: true, canBypass: true };
  }

  if (practice.moderation_status === MODERATION_STATUS.APPROVED) {
    return { ok: true, canBypass: false };
  }

  if (practice.status === "unpublished") {
    return {
      ok: false,
      code: "moderation_not_approved_for_republish",
      message:
        "После изменений отправьте продукт на модерацию. Повторная публикация без проверки доступна только для одобренной версии.",
      status: 403,
    };
  }

  return {
    ok: false,
    code: "moderation_required",
    message:
      "Сначала отправьте продукт на модерацию. Публикация станет доступна после одобрения.",
    status: 403,
  };
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
export function assertPracticePublicContentEditable(practice: {
  status: string;
  moderation_status?: string | null;
  deleted_at?: string | null;
}): void {
  if (practice.deleted_at) {
    throw new PracticeDeletedError();
  }

  assertPracticeNotUnderModeration(practice.moderation_status);

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

export function mapPublishRpcError(message: string): {
  status: number;
  code: string;
  message: string;
} | null {
  const normalized = message.toLowerCase();

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
    return {
      status: 400,
      code: "product_not_ready",
      message:
        "Продукт ещё не готов к публикации или отправке на модерацию. Проверьте обязательные поля, тему и аудио.",
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

export function mapModerationRpcError(message: string): {
  status: number;
  code: string;
  message: string;
} {
  const publishMapped = mapPublishRpcError(message);
  if (publishMapped) {
    return publishMapped;
  }

  const normalized = message.toLowerCase();

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
