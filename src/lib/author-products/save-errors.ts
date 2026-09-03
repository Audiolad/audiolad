import { getProductFieldErrorMessage } from "@/lib/author-products/limits";

export const PRODUCT_SAVE_ERROR_FALLBACK =
  "Не удалось сохранить аудиопродукт. Попробуйте ещё раз.";

export const PRODUCT_SAVE_VALIDATION_MESSAGE =
  "Проверьте заполнение полей и исправьте ошибки.";

export const PRODUCT_SAVE_APPRECIATION_NOT_ELIGIBLE_MESSAGE =
  "Настройка «Поблагодарить автора» доступна только при коммерческом доступе и только для подходящих бесплатных продуктов.";

export const PRODUCT_SAVE_PERMISSION_MESSAGE =
  "Недостаточно прав, чтобы сохранить этот аудиопродукт.";

export const PRODUCT_SAVE_SUPPORT_SESSION_MESSAGE =
  "Сессия поддержки автора недействительна или истекла. Выйдите из режима поддержки и войдите снова.";

export const PRODUCT_SAVE_SUPPORT_BLOCKED_MESSAGE =
  "Сейчас включён режим поддержки другого автора. Это действие в режиме поддержки недоступно.";

export const PRODUCT_SAVE_CONFLICT_MESSAGE =
  "Не удалось сохранить аудиопродукт: данные уже изменились. Обновите страницу и попробуйте снова.";

export const PRODUCT_SAVE_AUDIO_RELATION_MESSAGE =
  "Не удалось сохранить связь с аудиофайлом. Проверьте дорожки и повторите сохранение.";

export const PRODUCT_SAVE_NETWORK_MESSAGE =
  "Не удалось сохранить аудиопродукт: нет связи с сервером. Проверьте интернет и попробуйте снова.";

export const PRODUCT_SAVE_SERVER_MESSAGE =
  "Не удалось сохранить аудиопродукт из‑за ошибки сервера. Попробуйте ещё раз.";

export const PRODUCT_CREATE_ERROR_FALLBACK =
  "Не удалось создать черновик. Попробуйте ещё раз.";

const VALIDATION_CODES = new Set([
  "invalid_request",
  "invalid_publication_class",
  "invalid_product_kind",
  "invalid_cabinet_branch",
  "invalid_price",
  "audio_post_must_be_free",
  "music_usage_not_allowed_for_practice",
  "missing_music_usage_permission",
  "invalid_moderation_status_for_submit",
  "publish_not_ready",
  "title_too_long",
  "subtitle_too_long",
  "description_too_long",
  "audio_title_too_long",
  "audio_description_too_long",
  "custom_format_too_long",
  "missing_custom_format",
  "listening_notice_title_too_long",
  "listening_notice_text_too_long",
  "seo_primary_query_too_long",
  "seo_title_too_long",
  "seo_description_too_long",
  "author_recommendations_title_too_long",
  "appreciation_not_eligible",
]);

const PERMISSION_CODES = new Set([
  "forbidden",
  "unauthorized",
  "not_found",
  "author_content_mutations_blocked",
  "paid_products_not_allowed",
  "author_membership_required",
]);

const SUPPORT_SESSION_CODES = new Set([
  "support_session_invalid",
  "support_session_expired",
  "author_support_proof_missing",
  "author_support_session_invalid",
]);

const CONFLICT_CODES = new Set([
  "slug_taken",
  "product_kind_locked_after_publish",
  "PRODUCT_KIND_LOCKED_AFTER_PUBLISH",
  "practice_under_moderation",
  "practice_published_immutable",
  "practice_deleted",
  "PRODUCT_CONTENT_LOCKED_AFTER_SALE",
  "PRODUCT_PAID_PURCHASE_DELETE_LOCK",
  "update_failed",
]);

const AUDIO_RELATION_CODES = new Set([
  "audio_relation_failed",
  "audio_item_not_found",
  "audio_sync_failed",
  "practice_audio_compatibility_failed",
]);

const SERVER_CODES = new Set([
  "internal_error",
  "author_support_audit_failed",
]);

const SQL_OR_SECURITY_LEAK =
  /\b(select|insert|update|delete|from|where|join|rls|policy|service_role|auth\.uid|pg_|information_schema)\b/i;

export function isSafeProductSaveUserMessage(message: string | null | undefined) {
  const trimmed = message?.trim() ?? "";

  if (!trimmed || trimmed.length > 220) {
    return false;
  }

  return !SQL_OR_SECURITY_LEAK.test(trimmed);
}

export function classifyProductSaveError(input: {
  error?: string | null;
  status?: number | null;
  networkError?: boolean;
}):
  | "validation"
  | "permission"
  | "support_session"
  | "support_blocked"
  | "conflict"
  | "audio_relation"
  | "network"
  | "server"
  | "unknown" {
  if (input.networkError) {
    return "network";
  }

  const code = input.error?.trim() || "";
  const status = input.status ?? 0;

  if (code === "support_mutation_blocked") {
    return "support_blocked";
  }

  if (SUPPORT_SESSION_CODES.has(code)) {
    return "support_session";
  }

  if (VALIDATION_CODES.has(code) || getProductFieldErrorMessage(code)) {
    return "validation";
  }

  if (PERMISSION_CODES.has(code) || status === 401 || status === 403) {
    return "permission";
  }

  if (AUDIO_RELATION_CODES.has(code)) {
    return "audio_relation";
  }

  if (CONFLICT_CODES.has(code) || status === 409) {
    return "conflict";
  }

  if (SERVER_CODES.has(code) || status >= 500) {
    return "server";
  }

  if (!code && (status === 0 || input.networkError)) {
    return "network";
  }

  return "unknown";
}

export function getProductSaveErrorMessage(input: {
  error?: string | null;
  message?: string | null;
  status?: number | null;
  networkError?: boolean;
}): string {
  const fieldMessage = input.error
    ? getProductFieldErrorMessage(input.error)
    : null;

  if (fieldMessage) {
    return fieldMessage;
  }

  const kind = classifyProductSaveError(input);
  const safeMessage = isSafeProductSaveUserMessage(input.message)
    ? input.message!.trim()
    : null;

  switch (kind) {
    case "validation":
      if (input.error === "appreciation_not_eligible") {
        return PRODUCT_SAVE_APPRECIATION_NOT_ELIGIBLE_MESSAGE;
      }
      return safeMessage ?? PRODUCT_SAVE_VALIDATION_MESSAGE;
    case "permission":
      return PRODUCT_SAVE_PERMISSION_MESSAGE;
    case "support_session":
      return PRODUCT_SAVE_SUPPORT_SESSION_MESSAGE;
    case "support_blocked":
      return PRODUCT_SAVE_SUPPORT_BLOCKED_MESSAGE;
    case "conflict":
      return safeMessage ?? PRODUCT_SAVE_CONFLICT_MESSAGE;
    case "audio_relation":
      return PRODUCT_SAVE_AUDIO_RELATION_MESSAGE;
    case "network":
      return PRODUCT_SAVE_NETWORK_MESSAGE;
    case "server":
      return PRODUCT_SAVE_SERVER_MESSAGE;
    default:
      return PRODUCT_SAVE_ERROR_FALLBACK;
  }
}

export function getProductCreateErrorMessage(input: {
  error?: string | null;
  message?: string | null;
  status?: number | null;
  networkError?: boolean;
}): string {
  if (input.networkError) {
    return PRODUCT_SAVE_NETWORK_MESSAGE;
  }

  const mapped = getProductSaveErrorMessage(input);

  if (mapped === PRODUCT_SAVE_ERROR_FALLBACK) {
    return PRODUCT_CREATE_ERROR_FALLBACK;
  }

  return mapped;
}

export function logProductSaveFailure(input: {
  stage: string;
  practiceId?: string | null;
  error?: string | null;
  status?: number | null;
  networkError?: boolean;
}) {
  console.error("author_product_save_failure", {
    stage: input.stage,
    practiceId: input.practiceId ?? null,
    error: input.error ?? (input.networkError ? "network_error" : "unknown"),
    status: input.status ?? null,
  });
}
