import { getPersonalEmailDomainAllowlist, getServerEmailDomainAllowlist } from "./allowed-domains";

/**
 * t1446u: a NEW email (typed by the visitor, or linked as a login) may only use the same
 * Russian mail services as audiolad.ru registration (`config/email-domain-policy.json`).
 * Never apply this to sign-in, code login or password reset: existing accounts keep their email.
 *
 * `client` – personal allowlist only (UX hint); `server` – personal + corporate
 * (`AUDIOLAD_CORPORATE_EMAIL_DOMAINS`), exactly like `validateEmailForRegistrationServer`.
 */
export function isNewEmailDomainAllowed(email: string, side: "client" | "server" = "server"): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1);
  const allowlist = side === "client" ? getPersonalEmailDomainAllowlist() : getServerEmailDomainAllowlist();
  return allowlist.has(domain);
}
