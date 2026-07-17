import policy from "../../../../config/email-domain-policy.json";

const PERSONAL_ALLOWLIST = new Set(
  policy.personalAllowlist.map((domain) => domain.toLowerCase()),
);

function parseCorporateDomainsFromEnv(): Set<string> {
  const raw = process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS?.trim();

  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Public personal allowlist for client-side UX hints only. */
export function getPublicPersonalEmailDomains(): readonly string[] {
  return policy.personalAllowlist;
}

export function getPersonalEmailDomainAllowlist(): ReadonlySet<string> {
  return PERSONAL_ALLOWLIST;
}

export function getCorporateEmailDomainAllowlist(): ReadonlySet<string> {
  return parseCorporateDomainsFromEnv();
}

export function getServerEmailDomainAllowlist(): ReadonlySet<string> {
  const combined = new Set(PERSONAL_ALLOWLIST);

  for (const domain of parseCorporateDomainsFromEnv()) {
    combined.add(domain);
  }

  return combined;
}

/** Ensures JSON policy matches compiled personal set (used in tests). */
export function assertEmailDomainPolicyIntegrity(): void {
  const fromJson = new Set(
    policy.personalAllowlist.map((domain) => domain.toLowerCase()),
  );

  if (fromJson.size !== PERSONAL_ALLOWLIST.size) {
    throw new Error("email_domain_policy_integrity_failed");
  }

  for (const domain of fromJson) {
    if (!PERSONAL_ALLOWLIST.has(domain)) {
      throw new Error("email_domain_policy_integrity_failed");
    }
  }
}
