/**
 * Kill-switch until privacy/legal gates are approved.
 * Default: disabled. Enable explicitly with PAYOUT_PROFILES_ENABLED=true|1.
 */
export function isPayoutProfilesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.PAYOUT_PROFILES_ENABLED?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
