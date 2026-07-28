import type {
  AuthorPayoutMethod,
  AuthorPayoutProfileSensitivePayload,
} from "./types";

export function maskInn(inn: string | null | undefined): string {
  const digits = (inn ?? "").replace(/\D/g, "");
  if (digits.length < 4) {
    return "********";
  }
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskBankAccount(account: string | null | undefined): string {
  const digits = (account ?? "").replace(/\D/g, "");
  if (digits.length < 4) {
    return "****************";
  }
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskCardNumber(card: string | null | undefined): string {
  const digits = (card ?? "").replace(/\D/g, "");
  if (digits.length < 4) {
    return "Карта ••••";
  }
  return `Карта •••• ${digits.slice(-4)}`;
}

export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) {
    return "+7 *** ***-**-**";
  }
  const last4 = digits.slice(-4);
  return `+7 *** ***-${last4.slice(0, 2)}-${last4.slice(2)}`;
}

export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim();
  const at = value.indexOf("@");
  if (at <= 1) {
    return "***@***";
  }
  return `${value[0]}***${value.slice(at)}`;
}

export function last4Digits(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 4) {
    return null;
  }
  return digits.slice(-4);
}

export function buildAuthorPayoutProfileMasks(
  fields: AuthorPayoutProfileSensitivePayload,
): {
  inn_last4: string | null;
  account_last4: string | null;
  bank_display_name: string | null;
  payout_method: AuthorPayoutMethod | null;
} {
  const method = fields.payout_method;
  let accountLast4: string | null = null;

  if (method === "card") {
    accountLast4 = last4Digits(fields.card_number);
  } else if (method === "bank_account") {
    accountLast4 = last4Digits(fields.bank_account);
  } else if (method === "sbp") {
    accountLast4 = last4Digits(fields.phone);
  } else {
    accountLast4 =
      last4Digits(fields.bank_account) ?? last4Digits(fields.card_number);
  }

  return {
    inn_last4: last4Digits(fields.inn),
    account_last4: accountLast4,
    bank_display_name: fields.bank_name?.trim() || null,
    payout_method: method,
  };
}

export function formatPayoutRequisitesSummary(input: {
  payout_method: AuthorPayoutMethod | null;
  bank_display_name: string | null;
  account_last4: string | null;
}): string {
  const last4 = input.account_last4 ?? "****";
  const bank = input.bank_display_name?.trim() || null;

  switch (input.payout_method) {
    case "card":
      return `Карта •••• ${last4}${bank ? ` · ${bank}` : ""}`;
    case "sbp":
      return `СБП · ${bank ?? "банк"} · телефон •••• ${last4}`;
    case "bank_account":
      return `${bank ?? "Банк"} · счёт •••• ${last4}`;
    default:
      return bank ? `${bank} · •••• ${last4}` : `•••• ${last4}`;
  }
}

export function maskSensitivePayloadForLog(): string {
  return "[redacted]";
}
