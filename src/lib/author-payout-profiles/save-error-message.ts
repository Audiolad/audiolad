import type { AuthorPayoutProfileFieldErrors } from "./validation";

export type PayoutSaveKind = "draft" | "complete";

/** Fields that have no visible input in the author form (so their errors need a text summary). */
const FIELD_LABELS: Record<string, string> = {
  recipient_type: "Кто вы",
  payout_method: "Способ выплаты",
  last_name: "Фамилия",
  first_name: "Имя",
  middle_name: "Отчество",
  inn: "ИНН",
  ogrnip: "ОГРНИП",
  email: "Email",
  phone: "Телефон",
  card_number: "Номер карты",
  bank_account: "Номер счёта",
  bank_bik: "БИК",
  bank_name: "Банк",
  bank_correspondent_account: "Корр. счёт",
  is_npd_declared: "Подтверждение статуса НПД",
  details_confirmed: "Подтверждение данных",
  author_revision_comment: "Комментарий",
};

/**
 * Human-readable (Russian) reason for a failed payout profile save.
 * Never includes values — only field labels and generic causes.
 */
export function describePayoutSaveFailure(input: {
  kind: PayoutSaveKind;
  httpStatus?: number | null;
  error?: string | null;
  fieldErrors?: AuthorPayoutProfileFieldErrors | null;
}): string {
  const base =
    input.kind === "draft"
      ? "Не удалось сохранить черновик."
      : "Не удалось сохранить данные.";
  const code = input.error ?? "";

  if (code === "feature_not_available") {
    return "Заполнение данных для выплат временно недоступно. Попробуйте позднее.";
  }

  if (code === "validation_failed" || input.fieldErrors) {
    const keys = Object.keys(input.fieldErrors ?? {});
    if (keys.length > 0) {
      const labels = keys.map((key) => FIELD_LABELS[key] ?? key);
      return `${base} Проверьте поля: ${labels.join(", ")}.`;
    }
  }

  if (code.toLowerCase().includes("terms")) {
    return `${base} Сначала примите актуальные условия для авторов.`;
  }

  if (input.httpStatus === 401 || code === "unauthorized") {
    return `${base} Сессия истекла — войдите заново и повторите.`;
  }

  if (input.httpStatus === 403) {
    return `${base} Недостаточно прав для этого автора.`;
  }

  if (code === "profile_not_editable") {
    return `${base} Данные уже отправлены на проверку и сейчас недоступны для изменения.`;
  }

  if (code === "conflict") {
    return `${base} Данные были изменены в другой вкладке — обновите страницу и повторите.`;
  }

  if (code === "encryption_unavailable") {
    return `${base} Защищённое хранилище реквизитов временно недоступно, мы уже в курсе. Попробуйте позже.`;
  }

  return `${base} Попробуйте ещё раз; если повторяется — напишите в поддержку.`;
}
