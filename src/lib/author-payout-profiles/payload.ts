import type {
  AuthorPayoutMethod,
  AuthorPayoutProfileFormValues,
  AuthorPayoutProfileSensitivePayload,
  AuthorPayoutRecipientType,
} from "./types";
import { isAuthorPayoutMethod } from "./types";

export function formValuesToSensitivePayload(
  values: AuthorPayoutProfileFormValues,
  recipientType: AuthorPayoutRecipientType,
): AuthorPayoutProfileSensitivePayload {
  const method: AuthorPayoutMethod | null = isAuthorPayoutMethod(
    values.payout_method,
  )
    ? values.payout_method
    : null;

  const needsInn =
    recipientType === "self_employed" ||
    recipientType === "individual_entrepreneur";

  return {
    payout_method: method,
    legal_name:
      recipientType === "individual_entrepreneur"
        ? values.legal_name || null
        : null,
    first_name: values.first_name,
    last_name: values.last_name,
    middle_name: values.middle_name || null,
    inn: needsInn ? values.inn || null : values.inn || null,
    ogrnip:
      recipientType === "individual_entrepreneur"
        ? values.ogrnip || null
        : null,
    email: values.email,
    phone: values.phone,
    card_number: method === "card" ? values.card_number || null : null,
    bank_account:
      method === "bank_account" ? values.bank_account || null : null,
    bank_bik: method === "bank_account" ? values.bank_bik || null : null,
    bank_name: values.bank_name || null,
    bank_correspondent_account:
      method === "bank_account"
        ? values.bank_correspondent_account || null
        : null,
    registration_address: null,
    tax_residency_note: null,
  };
}

export function sensitivePayloadToFormValues(
  recipientType: AuthorPayoutRecipientType,
  fields: AuthorPayoutProfileSensitivePayload,
  extras?: {
    is_npd_declared?: boolean;
    author_revision_comment?: string | null;
  },
): AuthorPayoutProfileFormValues {
  return {
    recipient_type: recipientType,
    payout_method: fields.payout_method ?? "",
    legal_name: fields.legal_name ?? "",
    first_name: fields.first_name ?? "",
    last_name: fields.last_name ?? "",
    middle_name: fields.middle_name ?? "",
    inn: fields.inn ?? "",
    ogrnip: fields.ogrnip ?? "",
    email: fields.email ?? "",
    phone: fields.phone ?? "",
    // Never re-populate card/account into inputs after save — blank until re-entry.
    card_number: "",
    bank_account: "",
    bank_bik: fields.bank_bik ?? "",
    bank_name: fields.bank_name ?? "",
    bank_correspondent_account: fields.bank_correspondent_account ?? "",
    registration_address: "",
    tax_residency_note: "",
    is_npd_declared: extras?.is_npd_declared === true,
    details_confirmed: false,
    author_revision_comment: extras?.author_revision_comment ?? "",
  };
}

export function serializeSensitivePayload(
  payload: AuthorPayoutProfileSensitivePayload,
): string {
  return JSON.stringify(payload);
}

export function parseSensitivePayload(
  plaintext: string,
): AuthorPayoutProfileSensitivePayload {
  const parsed = JSON.parse(plaintext) as Partial<AuthorPayoutProfileSensitivePayload> & {
    // Legacy rows before payout_method existed treated bank_account as required.
    bank_account?: string | null;
  };

  const legacyMethod: AuthorPayoutMethod | null = isAuthorPayoutMethod(
    parsed.payout_method,
  )
    ? parsed.payout_method
    : parsed.bank_account
      ? "bank_account"
      : null;

  return {
    payout_method: legacyMethod,
    legal_name: parsed.legal_name ?? null,
    first_name: String(parsed.first_name ?? ""),
    last_name: String(parsed.last_name ?? ""),
    middle_name: parsed.middle_name ?? null,
    inn: parsed.inn != null && String(parsed.inn) !== "" ? String(parsed.inn) : null,
    ogrnip: parsed.ogrnip ?? null,
    email: String(parsed.email ?? ""),
    phone: String(parsed.phone ?? ""),
    card_number: parsed.card_number ?? null,
    bank_account: parsed.bank_account ?? null,
    bank_bik: parsed.bank_bik ?? null,
    bank_name: parsed.bank_name ?? null,
    bank_correspondent_account: parsed.bank_correspondent_account ?? null,
    registration_address: parsed.registration_address ?? null,
    tax_residency_note: parsed.tax_residency_note ?? null,
  };
}

export function listChangedSensitiveFields(
  before: AuthorPayoutProfileSensitivePayload | null,
  after: AuthorPayoutProfileSensitivePayload,
): string[] {
  const keys: Array<keyof AuthorPayoutProfileSensitivePayload> = [
    "payout_method",
    "legal_name",
    "first_name",
    "last_name",
    "middle_name",
    "inn",
    "ogrnip",
    "email",
    "phone",
    "card_number",
    "bank_account",
    "bank_bik",
    "bank_name",
    "bank_correspondent_account",
    "registration_address",
    "tax_residency_note",
  ];

  if (!before) {
    return keys.filter((key) => {
      const value = after[key];
      return value != null && String(value).trim() !== "";
    });
  }

  return keys.filter((key) => (before[key] ?? "") !== (after[key] ?? ""));
}
