export type EmailValidationErrorCode =
  | "empty"
  | "invalid_format"
  | "domain_not_allowed"
  | "local_part_empty"
  | "domain_empty"
  | "too_long"
  | "local_part_too_long";

export type EmailValidationResult =
  | { ok: true; normalizedEmail: string; domain: string }
  | { ok: false; code: EmailValidationErrorCode };

export const MAX_EMAIL_LENGTH = 254;
export const MAX_LOCAL_PART_LENGTH = 64;
