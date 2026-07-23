export type {
  EmailValidationErrorCode,
  EmailValidationResult,
} from "./types";

export {
  getCorporateEmailDomainAllowlist,
  getPersonalEmailDomainAllowlist,
  getPublicPersonalEmailDomains,
  getServerEmailDomainAllowlist,
  assertEmailDomainPolicyIntegrity,
} from "./allowed-domains";

export {
  normalizeEmailInput,
  splitEmailAddress,
  containsControlCharacters,
} from "./normalize";

export { validateEmailFormat } from "./validate-format";

export {
  validateEmailDomainForRegistration,
  validatePersonalEmailDomainForRegistration,
} from "./validate-domain";

export {
  EMAIL_FIELD_HINT,
  EMAIL_VALIDATION_MESSAGES,
  getEmailValidationMessage,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  SIGNUP_EMAIL_LABEL,
  SIGNUP_GENERIC_ERROR,
  SIGNUP_EXISTING_ACCOUNT_MESSAGE,
  SIGNUP_PASSWORD_HINT,
  SIGNUP_PASSWORD_LABEL,
  LEGAL_CONSENT_REQUIRED_MESSAGE,
  LISTENER_MARKETING_CONSENT_TEXT_VERSION,
  LISTENER_MARKETING_CONSENT_SOURCE,
} from "./messages";

import { getPersonalEmailDomainAllowlist } from "./allowed-domains";
import { validateEmailDomainForRegistration } from "./validate-domain";

/** Client UX validation: format + personal allowlist only. */
export function validateEmailForRegistrationClient(raw: string) {
  return validateEmailDomainForRegistration(raw, getPersonalEmailDomainAllowlist());
}

/** Server validation: format + personal + corporate allowlist. */
export function validateEmailForRegistrationServer(raw: string) {
  return validateEmailDomainForRegistration(raw);
}
