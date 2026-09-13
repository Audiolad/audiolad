export type RecoveryLandingState = "stage" | "ready" | "expired";

type RecoveryLandingInput = {
  tokenHash: string | null;
  type: string | null;
  hasStagedRecovery: boolean;
  stagedSuccessfullyInMount: boolean;
};

export function hasValidRecoveryTokenHash(value: string | null): boolean {
  return value !== null && /^[A-Za-z0-9_-]{20,512}$/.test(value);
}

export function getRecoveryLandingState({
  tokenHash,
  type,
  hasStagedRecovery,
  stagedSuccessfullyInMount,
}: RecoveryLandingInput): RecoveryLandingState {
  if (hasValidRecoveryTokenHash(tokenHash) && type === "recovery") {
    return "stage";
  }

  return hasStagedRecovery || stagedSuccessfullyInMount ? "ready" : "expired";
}
