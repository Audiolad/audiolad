import {
  MAX_EMAIL_LENGTH,
  MAX_LOCAL_PART_LENGTH,
  type EmailValidationErrorCode,
  type EmailValidationResult,
} from "./types";
import {
  containsControlCharacters,
  normalizeEmailInput,
  splitEmailAddress,
} from "./normalize";

function invalid(code: EmailValidationErrorCode): EmailValidationResult {
  return { ok: false, code };
}

function isValidDomainPart(part: string): boolean {
  if (!part || part.startsWith("-") || part.endsWith("-")) {
    return false;
  }

  if (!/^[a-z0-9-]+$/i.test(part)) {
    return false;
  }

  return true;
}

export function validateEmailFormat(raw: string): EmailValidationResult {
  if (!raw || !raw.trim()) {
    return invalid("empty");
  }

  const trimmed = raw.trim();

  if (trimmed.includes(" ") || containsControlCharacters(trimmed)) {
    return invalid("invalid_format");
  }

  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return invalid("too_long");
  }

  const parts = splitEmailAddress(trimmed);

  if (!parts) {
    return invalid("invalid_format");
  }

  const { localPart, domain } = parts;

  if (!localPart) {
    return invalid("local_part_empty");
  }

  if (!domain) {
    return invalid("domain_empty");
  }

  if (localPart.length > MAX_LOCAL_PART_LENGTH) {
    return invalid("local_part_too_long");
  }

  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    return invalid("invalid_format");
  }

  if (localPart.includes("..") || domain.includes("..")) {
    return invalid("invalid_format");
  }

  const domainParts = domain.toLowerCase().split(".");

  if (domainParts.length < 2 || domainParts.some((part) => !isValidDomainPart(part))) {
    return invalid("invalid_format");
  }

  const normalizedEmail = normalizeEmailInput(trimmed);

  return {
    ok: true,
    normalizedEmail,
    domain: domain.toLowerCase(),
  };
}
