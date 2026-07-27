import type { AuthorPayoutProfileSensitivePayload } from "./types";

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
  fields: Pick<AuthorPayoutProfileSensitivePayload, "inn" | "bank_account">,
): { inn_last4: string | null; account_last4: string | null } {
  return {
    inn_last4: last4Digits(fields.inn),
    account_last4: last4Digits(fields.bank_account),
  };
}

export function maskSensitivePayloadForLog(): string {
  return "[redacted]";
}
