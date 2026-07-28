export const AUTHOR_PAYOUT_RECIPIENT_TYPES = [
  "self_employed",
  "individual_entrepreneur",
  "individual",
] as const;

export type AuthorPayoutRecipientType =
  (typeof AUTHOR_PAYOUT_RECIPIENT_TYPES)[number];

/** UI-only; never accepted by API/SQL. */
export const AUTHOR_PAYOUT_RECIPIENT_TYPE_COMING_SOON = "legal_entity" as const;

export const AUTHOR_PAYOUT_METHODS = [
  "card",
  "sbp",
  "bank_account",
] as const;

export type AuthorPayoutMethod = (typeof AUTHOR_PAYOUT_METHODS)[number];

export const AUTHOR_PAYOUT_PROFILE_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "needs_changes",
  "verified",
  "rejected",
] as const;

export type AuthorPayoutProfileStatus =
  (typeof AUTHOR_PAYOUT_PROFILE_STATUSES)[number];

export const AUTHOR_PAYOUT_NPD_CHECK_RESULTS = [
  "not_checked",
  "needs_manual_check",
  "confirmed",
  "not_npd",
  "error",
] as const;

export type AuthorPayoutNpdCheckResult =
  (typeof AUTHOR_PAYOUT_NPD_CHECK_RESULTS)[number];

/**
 * Sensitive fields stored inside the encrypted envelope only.
 * Full card/account/SBP phone/INN/FIO never appear in open columns.
 */
export type AuthorPayoutProfileSensitivePayload = {
  payout_method: AuthorPayoutMethod | null;
  legal_name: string | null;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  inn: string | null;
  ogrnip: string | null;
  email: string;
  phone: string;
  /** Digits-only card PAN when payout_method === card. */
  card_number: string | null;
  bank_account: string | null;
  bank_bik: string | null;
  bank_name: string | null;
  bank_correspondent_account: string | null;
  /** Legacy; no longer collected by the minimal form. */
  registration_address: string | null;
  tax_residency_note: string | null;
};

export type AuthorPayoutProfileFormValues = {
  recipient_type: AuthorPayoutRecipientType | "";
  payout_method: AuthorPayoutMethod | "";
  legal_name: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  inn: string;
  ogrnip: string;
  email: string;
  phone: string;
  card_number: string;
  bank_account: string;
  bank_bik: string;
  bank_name: string;
  bank_correspondent_account: string;
  registration_address: string;
  tax_residency_note: string;
  is_npd_declared: boolean;
  details_confirmed: boolean;
  author_revision_comment: string;
};

export type AuthorPayoutProfilePublicView = {
  id: string;
  author_id: string;
  recipient_type: AuthorPayoutRecipientType;
  status: AuthorPayoutProfileStatus;
  version: number;
  payout_method: AuthorPayoutMethod | null;
  bank_display_name: string | null;
  inn_last4: string | null;
  account_last4: string | null;
  is_npd_declared: boolean;
  npd_status_check_result: AuthorPayoutNpdCheckResult | null;
  review_comment: string | null;
  author_revision_comment: string | null;
  submitted_at: string | null;
  review_started_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  /** Present only for author edit modes and admin full view. */
  fields?: AuthorPayoutProfileSensitivePayload | null;
  can_edit: boolean;
  can_submit: boolean;
  can_start_edit_from_verified: boolean;
};

export type AuthorPayoutProfileAdminListItem = {
  id: string;
  author_id: string;
  author_name: string;
  author_slug: string | null;
  recipient_type: AuthorPayoutRecipientType;
  payout_method: AuthorPayoutMethod | null;
  bank_display_name: string | null;
  status: AuthorPayoutProfileStatus;
  version: number;
  inn_last4: string | null;
  account_last4: string | null;
  submitted_at: string | null;
  updated_at: string;
};

export type AuthorPayoutProfileAdminDetail = AuthorPayoutProfileAdminListItem & {
  is_npd_declared: boolean;
  npd_status_checked_at: string | null;
  npd_status_check_result: AuthorPayoutNpdCheckResult | null;
  review_comment: string | null;
  staff_note: string | null;
  author_revision_comment: string | null;
  reviewed_by: string | null;
  submitted_at: string | null;
  review_started_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  created_at: string;
  fields: AuthorPayoutProfileSensitivePayload;
};

export function isAuthorPayoutRecipientType(
  value: unknown,
): value is AuthorPayoutRecipientType {
  return (
    typeof value === "string" &&
    (AUTHOR_PAYOUT_RECIPIENT_TYPES as readonly string[]).includes(value)
  );
}

export function isAuthorPayoutMethod(
  value: unknown,
): value is AuthorPayoutMethod {
  return (
    typeof value === "string" &&
    (AUTHOR_PAYOUT_METHODS as readonly string[]).includes(value)
  );
}

export function isAuthorPayoutProfileStatus(
  value: unknown,
): value is AuthorPayoutProfileStatus {
  return (
    typeof value === "string" &&
    (AUTHOR_PAYOUT_PROFILE_STATUSES as readonly string[]).includes(value)
  );
}

export function getAuthorPayoutRecipientTypeLabel(
  type: AuthorPayoutRecipientType,
): string {
  switch (type) {
    case "self_employed":
      return "Самозанятый";
    case "individual_entrepreneur":
      return "Индивидуальный предприниматель";
    case "individual":
      return "Физическое лицо";
    default:
      return type;
  }
}

export function getAuthorPayoutMethodLabel(method: AuthorPayoutMethod): string {
  switch (method) {
    case "card":
      return "Банковская карта";
    case "sbp":
      return "СБП";
    case "bank_account":
      return "Банковский счёт";
    default:
      return method;
  }
}

/** Simplified author-facing status (DB statuses stay unchanged). */
export function getAuthorPayoutProfileDisplayState(
  status: AuthorPayoutProfileStatus | null | undefined,
): "empty" | "filled" | "needs_changes" {
  if (!status || status === "draft") {
    return "empty";
  }
  if (status === "needs_changes" || status === "rejected") {
    return "needs_changes";
  }
  return "filled";
}

export function getAuthorPayoutProfileStatusLabel(
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
      return "Данные заполнены";
    case "rejected":
      return "Требуется уточнение";
    default:
      return status;
  }
}
