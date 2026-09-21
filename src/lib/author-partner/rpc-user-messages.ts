/**
 * Map partner RPC exception messages to cabinet-facing Russian copy.
 * Never surface raw SQL / Postgres strings to the author.
 */

export type PartnerCodeUserErrorCode =
  | "code_taken"
  | "reserved_code"
  | "invalid_code"
  | "partner_profile_disabled"
  | "partner_profile_missing"
  | "forbidden"
  | "support_mode_blocked"
  | "beta_disabled"
  | "unknown";

const MESSAGES: Record<PartnerCodeUserErrorCode, string> = {
  code_taken: "Этот код уже занят. Попробуйте другой.",
  reserved_code: "Этот код нельзя использовать. Выберите другой.",
  invalid_code:
    "Используйте от 3 до 32 символов: латинские буквы, цифры, дефис или нижнее подчёркивание.",
  partner_profile_disabled: "Персональная ссылка временно недоступна.",
  partner_profile_missing: "Сначала создайте персональную ссылку.",
  forbidden: "Недостаточно прав для этого действия.",
  support_mode_blocked:
    "В режиме поддержки нельзя создавать или менять код приглашения.",
  beta_disabled: "Раздел пока недоступен для этого авторского пространства.",
  unknown: "Не удалось сохранить код. Попробуйте ещё раз.",
};

export function partnerCodeUserMessage(
  code: PartnerCodeUserErrorCode | string | null | undefined,
): string {
  if (code && code in MESSAGES) {
    return MESSAGES[code as PartnerCodeUserErrorCode];
  }
  return MESSAGES.unknown;
}

/** Extract known partner RPC error token from a PostgREST / Postgres error. */
export function parsePartnerRpcErrorCode(
  error: { message?: string | null; code?: string | null } | null | undefined,
): PartnerCodeUserErrorCode {
  const raw = `${error?.message ?? ""} ${error?.code ?? ""}`.toLowerCase();
  if (!raw.trim()) return "unknown";
  if (raw.includes("code_taken")) return "code_taken";
  if (raw.includes("reserved_code")) return "reserved_code";
  if (raw.includes("invalid_code")) return "invalid_code";
  if (raw.includes("partner_profile_disabled")) return "partner_profile_disabled";
  if (raw.includes("partner_profile_missing")) return "partner_profile_missing";
  if (raw.includes("forbidden") || raw.includes("42501")) return "forbidden";
  return "unknown";
}
