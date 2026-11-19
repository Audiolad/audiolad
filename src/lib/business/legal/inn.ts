/**
 * ИНН Клиента (оферта «АудиоЛад Кофейня», ред. 3, раздел 3, t1591u).
 * 10 цифр – организация (ООО, АО …), 12 цифр – ИП. Контрольные цифры – по алгоритму ФНС.
 * Наименование и ОГРН/ОГРНИП берутся только из госреестра (egrul.server.ts), владелец их не вводит.
 */

export type BusinessInnKind = "ul" | "ip";

const W10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const W11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const W12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function control(digits: number[], weights: number[]): number {
  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  return (sum % 11) % 10;
}

/** Spaces, dashes and dots that people type are dropped; anything else is kept and fails the check. */
export function normalizeBusinessInn(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\s.\-–]/g, "");
}

export function businessInnKind(inn: string): BusinessInnKind | null {
  if (/^\d{10}$/.test(inn)) return "ul";
  if (/^\d{12}$/.test(inn)) return "ip";
  return null;
}

/** True when the ИНН has 10 or 12 digits and the control digits match. */
export function isValidBusinessInn(inn: string): boolean {
  const kind = businessInnKind(inn);
  if (!kind) return false;
  if (/^0+$/.test(inn)) return false;
  const d = inn.split("").map(Number);
  if (kind === "ul") return control(d, W10) === d[9];
  return control(d, W11) === d[10] && control(d, W12) === d[11];
}

export type BusinessInnCheck =
  | { ok: true; inn: string; kind: BusinessInnKind }
  | { ok: false; error: "inn_empty" | "inn_format" | "inn_checksum" };

export function checkBusinessInn(raw: unknown): BusinessInnCheck {
  const inn = normalizeBusinessInn(raw);
  if (!inn) return { ok: false, error: "inn_empty" };
  const kind = businessInnKind(inn);
  if (!kind) return { ok: false, error: "inn_format" };
  if (!isValidBusinessInn(inn)) return { ok: false, error: "inn_checksum" };
  return { ok: true, inn, kind };
}

export const BUSINESS_INN_ERRORS: Record<string, string> = {
  inn_empty: "Введите ИНН организации или ИП.",
  inn_format: "ИНН – это 10 цифр для организации или 12 цифр для ИП.",
  inn_checksum: "В ИНН ошибка: контрольные цифры не сходятся. Проверьте номер.",
  inn_not_found: "Такого ИНН нет в ЕГРЮЛ и ЕГРИП. Проверьте номер.",
  inn_inactive: "По этому ИНН организация или ИП прекратили деятельность. Укажите действующий ИНН.",
  registry_unavailable: "Реестр ФНС сейчас не отвечает. Попробуйте ещё раз через минуту.",
  not_owner: "ИНН указывает только владелец учётной записи.",
  no_organization: "Сначала добавьте кофейню.",
  unauthorized: "Войдите в кабинет, чтобы указать ИНН.",
  internal_error: "Не получилось сохранить ИНН. Попробуйте ещё раз.",
};
