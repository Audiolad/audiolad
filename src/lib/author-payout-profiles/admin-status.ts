/**
 * Staff-facing status labels, filter chips and confirmation guards for the
 * admin «Данные для выплат» review screen.
 *
 * The author cabinet intentionally uses simplified labels
 * (`getAuthorPayoutProfileStatusLabel`: verified → «Данные заполнены»,
 * needs_changes/rejected → «Требуется уточнение»). Those labels must never be
 * used on the admin screen: there staff need to see whether they have already
 * confirmed a questionnaire, and every filter chip must be distinct.
 *
 * Pure module (no server-only imports) so it can be used by client components
 * and unit tests. Never returns or embeds requisite values – only field names.
 */
import type {
  AuthorPayoutMethod,
  AuthorPayoutProfileSensitivePayload,
  AuthorPayoutProfileStatus,
  AuthorPayoutRecipientType,
} from "./types";
import {
  isValidBankAccount,
  isValidBik,
  isValidCardNumberLength,
  isValidPhone,
  isValidRussianPersonalInn,
} from "./validation";

export function getAdminPayoutProfileStatusLabel(
  status: AuthorPayoutProfileStatus,
): string {
  switch (status) {
    case "draft":
      return "Черновик";
    case "submitted":
      return "Данные отправлены";
    case "in_review":
      return "На проверке";
    case "needs_changes":
      return "Требуется уточнение";
    case "verified":
      return "Данные подтверждены";
    case "rejected":
      return "Отклонена";
    default:
      return status;
  }
}

export type AdminPayoutProfileStatusTone =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "neutral";

export function getAdminPayoutProfileStatusTone(
  status: AuthorPayoutProfileStatus,
): AdminPayoutProfileStatusTone {
  switch (status) {
    case "verified":
      return "success";
    case "submitted":
    case "in_review":
      return "info";
    case "needs_changes":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

export const ADMIN_PAYOUT_PROFILE_STATUS_TONE_CLASSES: Record<
  AdminPayoutProfileStatusTone,
  string
> = {
  success: "border-[#cfe8d9] bg-[#eaf7ef] text-[#2f7a52]",
  info: "border-[#e4d7f4] bg-[#f6f0ff] text-[#7042c5]",
  warning: "border-[#f0e2b8] bg-[#fff9e8] text-[#8a6a1f]",
  danger: "border-[#efc7cf] bg-[#fff8f9] text-[#b34f63]",
  neutral: "border-[#eadff8] bg-white text-[#796ba0]",
};

export type AdminPayoutProfileFilterKey = AuthorPayoutProfileStatus | "all";

/** Filter chips for the admin list: one per non-draft status, all unique. */
export const ADMIN_PAYOUT_PROFILE_FILTERS: readonly {
  key: AdminPayoutProfileFilterKey;
  label: string;
}[] = [
  { key: "all", label: "Все" },
  { key: "submitted", label: "Отправлены" },
  { key: "in_review", label: "На проверке" },
  { key: "needs_changes", label: "Требуется уточнение" },
  { key: "verified", label: "Подтверждены" },
  { key: "rejected", label: "Отклонены" },
] as const;

export function resolveAdminPayoutProfileFilter(
  value: string | undefined,
): AdminPayoutProfileFilterKey {
  if (!value) {
    return "all";
  }
  const match = ADMIN_PAYOUT_PROFILE_FILTERS.find(
    (filter) => filter.key === value,
  );
  return match ? match.key : "all";
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

/**
 * A bank name must contain at least one letter. A value made only of digits,
 * spaces and phone punctuation (e.g. a phone number typed into «Банк») is not
 * a bank name.
 */
export function payoutBankNameLooksInvalid(
  bankName: string | null | undefined,
): boolean {
  if (!hasText(bankName)) {
    return false;
  }
  return !/\p{L}/u.test(bankName as string);
}

/**
 * Reasons why staff cannot confirm a questionnaire (empty list = OK).
 * Scope: presence/format of the requisites needed to actually pay out with
 * the selected method (a subset of the author submit rules: name, INN for
 * self-employed/ИП, bank, card/SBP phone/БИК+account), plus the bank-name
 * sanity check. Contact email, consent checkboxes and optional fields are
 * not re-checked here. Messages name fields only, never values.
 */
export function findPayoutProfileVerifyBlockers(input: {
  recipientType: AuthorPayoutRecipientType;
  payoutMethod: AuthorPayoutMethod | null;
  fields: AuthorPayoutProfileSensitivePayload | null;
}): string[] {
  const fields = input.fields;
  if (!fields) {
    return ["не удалось прочитать данные анкеты"];
  }

  const blockers: string[] = [];
  const method = input.payoutMethod ?? fields.payout_method ?? null;

  if (!hasText(fields.last_name) || !hasText(fields.first_name)) {
    blockers.push("не указаны фамилия и имя");
  }

  if (
    (input.recipientType === "self_employed" ||
      input.recipientType === "individual_entrepreneur") &&
    !isValidRussianPersonalInn(fields.inn ?? "")
  ) {
    blockers.push("не указан корректный ИНН");
  }

  if (!method) {
    blockers.push("не выбран способ получения выплаты");
    return blockers;
  }

  if (!hasText(fields.bank_name)) {
    blockers.push("не указан банк");
  } else if (payoutBankNameLooksInvalid(fields.bank_name)) {
    blockers.push("в поле «Банк» указано не название банка (только цифры)");
  }

  if (method === "card" && !isValidCardNumberLength(fields.card_number ?? "")) {
    blockers.push("не указан номер карты");
  }

  if (method === "sbp" && !isValidPhone(fields.phone ?? "")) {
    blockers.push("не указан телефон, подключённый к СБП");
  }

  if (method === "bank_account") {
    if (!isValidBik(fields.bank_bik ?? "")) {
      blockers.push("не указан БИК");
    }
    if (!isValidBankAccount(fields.bank_account ?? "")) {
      blockers.push("не указан расчётный счёт");
    }
  }

  return blockers;
}

export function formatPayoutProfileVerifyBlockedMessage(
  blockers: readonly string[],
): string {
  return `Данные нельзя подтвердить: ${blockers.join("; ")}. Запросите у автора изменения.`;
}

/** Red error text for a failed staff transition (by service error code). */
export function describeStaffPayoutTransitionError(code: string | null): string {
  switch (code) {
    case "transition_not_allowed":
      return "Анкету в текущем статусе нельзя перевести в выбранный статус. Обновите страницу.";
    case "conflict":
      return "Анкету только что изменили. Обновите страницу и проверьте данные ещё раз.";
    case "not_found":
      return "Анкета не найдена.";
    case "review_comment_required":
      return "Укажите комментарий для автора.";
    case "encryption_unavailable":
    case "encryption_envelope_invalid":
      return "Не удалось прочитать данные анкеты. Статус не изменён.";
    default:
      return "Не удалось обновить статус анкеты.";
  }
}
