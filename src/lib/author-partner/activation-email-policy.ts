/** Mirrors the AFTER UPDATE trigger WHEN clause. Not a second attribution engine. */
export function shouldEnqueuePartnerActivationEmail(input: {
  previousActivatedAt: string | null;
  nextActivatedAt: string | null;
  nextStatus: string;
}): boolean {
  return (
    input.previousActivatedAt == null &&
    input.nextActivatedAt != null &&
    input.nextStatus === "activated"
  );
}

const ACTIVATION_RESULT = "activated";

function walk(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(walk);
  const row = value as Record<string, unknown>;
  if (row.result === ACTIVATION_RESULT) return true;
  return Object.values(row).some(walk);
}

/**
 * True only when a payload contains result "activated".
 * "already_activated", "no_referral", and plain "bound" do not match.
 */
export function payloadIndicatesFirstPartnerActivation(value: unknown): boolean {
  return walk(value);
}
