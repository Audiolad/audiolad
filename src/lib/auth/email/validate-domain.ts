import {
  getPersonalEmailDomainAllowlist,
  getServerEmailDomainAllowlist,
} from "./allowed-domains";
import type { EmailValidationResult } from "./types";
import { validateEmailFormat } from "./validate-format";

export function validateEmailDomainForRegistration(
  raw: string,
  allowlist: ReadonlySet<string> = getServerEmailDomainAllowlist(),
): EmailValidationResult {
  const formatResult = validateEmailFormat(raw);

  if (!formatResult.ok) {
    return formatResult;
  }

  if (!allowlist.has(formatResult.domain)) {
    return { ok: false, code: "domain_not_allowed" };
  }

  return formatResult;
}

/** Client-safe: personal allowlist only (no corporate domains). */
export function validatePersonalEmailDomainForRegistration(
  raw: string,
): EmailValidationResult {
  return validateEmailDomainForRegistration(
    raw,
    getPersonalEmailDomainAllowlist(),
  );
}
