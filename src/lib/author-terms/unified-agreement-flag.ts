/**
 * Feature flag for the unified commercial agreement 2.0 (tasks 8dcba9d1 / 8d9cd0af).
 * Server env only. Off (default) = behaviour identical to edition 1.2 flow:
 * no new DB columns are read, Business keeps the legacy form.
 */
export const UNIFIED_AGREEMENT_FLAG_ENV = "AUDIOLAD_UNIFIED_AGREEMENT_ENABLED" as const;

export function isUnifiedAgreementEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[UNIFIED_AGREEMENT_FLAG_ENV] === "1";
}
