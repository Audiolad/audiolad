/**
 * Admin queue for Business rights-holder verification (account-level example check).
 * Pure helpers only: the DB RPCs (moderator_business_verification_action /
 * moderator_business_suspend_product) remain the single source of truth for
 * permissions, transitions, required reasons, self-moderation and audit.
 */

export const BUSINESS_VERIFICATION_ADMIN_PATH = "/admin/business-verification";

export type BusinessVerificationStatus =
  | "draft"
  | "submitted"
  | "needs_info"
  | "verified"
  | "rejected"
  | "restricted"
  | "revoked";

export type BusinessModerationAction =
  | "approve"
  | "request_info"
  | "reject"
  | "reopen"
  | "restrict"
  | "revoke";

export const BUSINESS_VERIFICATION_STATUS_LABEL: Record<BusinessVerificationStatus, string> = {
  draft: "Черновик",
  submitted: "На проверке",
  needs_info: "Запрошено уточнение",
  verified: "Пример подтверждён",
  rejected: "Отклонено",
  restricted: "Ограничено",
  revoked: "Отозвано",
};

export const BUSINESS_MODERATION_ACTION_LABEL: Record<BusinessModerationAction, string> = {
  approve: "Подтвердить",
  request_info: "Запросить уточнение",
  reject: "Отклонить",
  reopen: "Вернуть на уточнение",
  restrict: "Ограничить",
  revoke: "Отозвать",
};

/** Mirrors the transition table of moderator_business_verification_action (the DB re-checks it). */
const TRANSITIONS: Record<BusinessModerationAction, readonly BusinessVerificationStatus[]> = {
  approve: ["submitted"],
  request_info: ["submitted"],
  reject: ["submitted", "needs_info"],
  reopen: ["rejected"],
  restrict: ["verified"],
  revoke: ["verified", "restricted"],
};

export const BUSINESS_MODERATION_ACTIONS = Object.keys(TRANSITIONS) as BusinessModerationAction[];

export function isBusinessModerationAction(value: unknown): value is BusinessModerationAction {
  return typeof value === "string" && (BUSINESS_MODERATION_ACTIONS as string[]).includes(value);
}

export function allowedBusinessModerationActions(status: string): BusinessModerationAction[] {
  return BUSINESS_MODERATION_ACTIONS.filter((action) =>
    (TRANSITIONS[action] as readonly string[]).includes(status),
  );
}

export type BusinessVerificationFilterKey = "open" | "all" | BusinessVerificationStatus;

/**
 * Sergey 18.10 20:16 MSK: the decision comment is optional for «Подтвердить» only.
 * Reject / request_info / reopen / restrict / revoke and suspensions still need a reason.
 */
export function isBusinessModerationReasonOptional(action: string): boolean {
  return action === "approve";
}

/**
 * Stored when «Подтвердить» is saved without a comment. The DB RPC keeps its non-empty reason
 * check (audit rows always carry text), so the app sends this neutral default instead of "".
 */
export const BUSINESS_APPROVE_DEFAULT_REASON = "Подтверждено без комментария";

export function businessModerationReasonPlaceholder(action: string): string {
  return isBusinessModerationReasonOptional(action) ? "Комментарий (необязательно)" : "Причина решения (обязательно)";
}

/** Reason to send to the RPC, or null when a required reason is missing. */
export function resolveBusinessModerationReason(action: string, reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed) return trimmed;
  return isBusinessModerationReasonOptional(action) ? BUSINESS_APPROVE_DEFAULT_REASON : null;
}

export const BUSINESS_VERIFICATION_FILTERS: { key: BusinessVerificationFilterKey; label: string }[] = [
  { key: "open", label: "Ждут решения" },
  { key: "verified", label: "Подтверждены" },
  { key: "rejected", label: "Отклонены" },
  { key: "all", label: "Все" },
];

/** Statuses shown for a filter; null = no status filter. */
export function statusesForBusinessVerificationFilter(
  key: BusinessVerificationFilterKey,
): BusinessVerificationStatus[] | null {
  if (key === "all") return null;
  if (key === "open") return ["submitted", "needs_info"];
  return [key];
}

export function resolveBusinessVerificationFilter(value: string | undefined | null): BusinessVerificationFilterKey {
  const keys = BUSINESS_VERIFICATION_FILTERS.map((f) => f.key) as string[];
  return value && keys.includes(value) ? (value as BusinessVerificationFilterKey) : "open";
}

/**
 * Whether the signed-in moderator is looking at their OWN case. Only the platform owner may
 * act on it (DB: business_moderation_owner_self_allowed); the UI hides actions for everyone else.
 */
export function canActOnOwnBusinessCase(input: { isOwnCase: boolean; isPlatformOwner: boolean }): boolean {
  return !input.isOwnCase || input.isPlatformOwner;
}

const ERROR_TEXT: Record<string, string> = {
  business_moderator_required: "Нет прав модератора АудиоЛад Бизнес.",
  business_moderation_reason_required: "Укажите причину решения – она сохраняется в журнале.",
  business_verification_not_found: "Заявка не найдена.",
  business_self_moderation_forbidden:
    "Модерировать собственную заявку может только владелец платформы и только вне режима сопровождения автора.",
  business_verification_transition_forbidden: "Это действие недоступно для текущего статуса заявки. Обновите страницу.",
  business_rightsholder_invalid: "Выбранный правообладатель не найден или неактивен.",
  business_rightsholder_binding_approve_only: "Правообладателя можно указать только при подтверждении.",
  business_product_not_found: "Продукт не найден.",
  business_track_not_in_product: "Трек не относится к этому продукту.",
};

/** Maps an RPC error message (contains the raised code) to a Russian, user-facing text. */
export function businessModerationErrorText(message: string | null | undefined): string {
  const text = message ?? "";
  for (const [code, human] of Object.entries(ERROR_TEXT)) {
    if (text.includes(code)) return human;
  }
  if (/music_rightsholders_display_name|null value in column "display_name"/.test(text)) {
    return "Укажите имя нового правообладателя (до 200 символов).";
  }
  if (/music_rightsholders_entity_type|null value in column "entity_type"/.test(text)) {
    return "Укажите тип правообладателя: физлицо или организация.";
  }
  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate the explicit decision and approval scope before calling the session-bound RPC. */
export function validateBusinessDecisionInput(input: {
  action: string; reason: string; rightsholder: string; newDisplayName: string; newEntityType: string; confirmScope: string;
}): string | null {
  if (!input.action) return "Выберите решение";
  if (!isBusinessModerationAction(input.action)) return "Некорректное решение.";
  if (input.action === "approve") {
    if (!input.rightsholder) return "Выберите правообладателя, которому присваивается подтверждение.";
    if (input.rightsholder === "new") {
      const name = input.newDisplayName.trim();
      if (!name || name.length > 200) return "Укажите имя нового правообладателя (до 200 символов).";
      if (!["person", "organization"].includes(input.newEntityType)) return "Укажите тип правообладателя: физлицо или организация.";
    } else if (!UUID_RE.test(input.rightsholder)) return "Некорректный правообладатель.";
    if (input.confirmScope !== "yes") return "Подтвердите правообладателя и охват решения галочкой.";
  }
  if (!resolveBusinessModerationReason(input.action, input.reason)) return businessModerationErrorText("business_moderation_reason_required");
  return null;
}
