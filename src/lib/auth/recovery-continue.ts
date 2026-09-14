export type RecoveryContinueActionOutcome =
  | { kind: "success"; destination: string }
  | { kind: "action_error"; message: string; retryable?: boolean }
  | { kind: "transport_error" };

export type RecoveryContinueUiState = {
  isVerifying: boolean;
  ready: boolean;
  error: string;
  shouldNavigateTo: string | null;
};

export type RecoveryContinueMessages = {
  temporary: string;
  expired: string;
  transport: string;
};

/** Pure mapping used by Continue click handling (and unit tests). */
export function applyRecoveryContinueOutcome(
  outcome: RecoveryContinueActionOutcome,
  messages: RecoveryContinueMessages,
): RecoveryContinueUiState {
  if (outcome.kind === "success") {
    return {
      isVerifying: false,
      ready: true,
      error: "",
      shouldNavigateTo: outcome.destination,
    };
  }

  if (outcome.kind === "action_error") {
    const retryable = outcome.retryable === true;
    return {
      isVerifying: false,
      ready: retryable,
      error: outcome.message || messages.expired,
      shouldNavigateTo: null,
    };
  }

  // Ambiguous: server may already have consumed the recovery token.
  return {
    isVerifying: false,
    ready: false,
    error: messages.transport,
    shouldNavigateTo: null,
  };
}

/**
 * Terminal boundary for recovery verify.
 * Only verify_not_resolved_exception happens before a terminal verify result.
 */
export type RecoveryVerifyStatus =
  | "verify_not_resolved_exception"
  | "invalid_or_expired"
  | "success"
  | "post_verify_failure";

export type StageCookieDecision = "keep" | "clear";

export function decideStageCookieAfterVerify(input: {
  verifyStatus: RecoveryVerifyStatus;
}): StageCookieDecision {
  if (input.verifyStatus === "verify_not_resolved_exception") return "keep";
  return "clear";
}

/** Whether a structured server failure may safely offer Continue retry. */
export function isStructuredVerifyFailureRetryable(
  verifyStatus: RecoveryVerifyStatus,
): boolean {
  return verifyStatus === "verify_not_resolved_exception";
}

/**
 * Runtime decision for server action outcomes after a verify attempt.
 * Used by production action + unit tests so the model cannot drift.
 */
export type RecoveryVerifyActionDecision = {
  stage: StageCookieDecision;
  retryable: boolean;
  resultKind: "success" | "temporary" | "expired" | "non_retryable";
};

export function decideRecoveryVerifyAction(input: {
  verifyStatus: RecoveryVerifyStatus;
}): RecoveryVerifyActionDecision {
  const stage = decideStageCookieAfterVerify(input);
  if (input.verifyStatus === "success") {
    return { stage, retryable: false, resultKind: "success" };
  }
  if (input.verifyStatus === "verify_not_resolved_exception") {
    return { stage, retryable: true, resultKind: "temporary" };
  }
  if (input.verifyStatus === "invalid_or_expired") {
    return { stage, retryable: false, resultKind: "expired" };
  }
  // post_verify_failure: token already consumed — never retry.
  return { stage, retryable: false, resultKind: "non_retryable" };
}
