import type {
  AuthorPayoutProfileFormValues,
  AuthorPayoutProfileSensitivePayload,
  AuthorPayoutRecipientType,
} from "./types";

export function formValuesToSensitivePayload(
  values: AuthorPayoutProfileFormValues,
  recipientType: AuthorPayoutRecipientType,
): AuthorPayoutProfileSensitivePayload {
  return {
    legal_name:
      recipientType === "individual_entrepreneur"
        ? values.legal_name || null
        : null,
    first_name: values.first_name,
    last_name: values.last_name,
    middle_name: values.middle_name || null,
    inn: values.inn,
    ogrnip:
      recipientType === "individual_entrepreneur" ? values.ogrnip || null : null,
    email: values.email,
    phone: values.phone,
    bank_account: values.bank_account,
    bank_bik: values.bank_bik,
    bank_name: values.bank_name,
    bank_correspondent_account:
      recipientType === "individual_entrepreneur"
        ? values.bank_correspondent_account || null
        : values.bank_correspondent_account || null,
    registration_address:
      recipientType === "self_employed"
        ? values.registration_address || null
        : values.registration_address || null,
    tax_residency_note:
      recipientType === "individual"
        ? values.tax_residency_note || null
        : null,
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
    legal_name: fields.legal_name ?? "",
    first_name: fields.first_name ?? "",
    last_name: fields.last_name ?? "",
    middle_name: fields.middle_name ?? "",
    inn: fields.inn ?? "",
    ogrnip: fields.ogrnip ?? "",
    email: fields.email ?? "",
    phone: fields.phone ?? "",
    bank_account: fields.bank_account ?? "",
    bank_bik: fields.bank_bik ?? "",
    bank_name: fields.bank_name ?? "",
    bank_correspondent_account: fields.bank_correspondent_account ?? "",
    registration_address: fields.registration_address ?? "",
    tax_residency_note: fields.tax_residency_note ?? "",
    is_npd_declared: extras?.is_npd_declared === true,
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
  const parsed = JSON.parse(plaintext) as AuthorPayoutProfileSensitivePayload;
  return {
    legal_name: parsed.legal_name ?? null,
    first_name: String(parsed.first_name ?? ""),
    last_name: String(parsed.last_name ?? ""),
    middle_name: parsed.middle_name ?? null,
    inn: String(parsed.inn ?? ""),
    ogrnip: parsed.ogrnip ?? null,
    email: String(parsed.email ?? ""),
    phone: String(parsed.phone ?? ""),
    bank_account: String(parsed.bank_account ?? ""),
    bank_bik: String(parsed.bank_bik ?? ""),
    bank_name: String(parsed.bank_name ?? ""),
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
    "legal_name",
    "first_name",
    "last_name",
    "middle_name",
    "inn",
    "ogrnip",
    "email",
    "phone",
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
