export type InitialSessionRestorePhase =
  | "pending"
  | "restoring"
  | "restored"
  | "no-history"
  | "ready"
  | "failed";

export type ResumeHistoryCheckResult =
  | "not_applicable"
  | "restored"
  | "no_history"
  | "failed";

export type ShouldLoadWelcomeSessionInput = {
  phase: InitialSessionRestorePhase;
  hasActiveSession: boolean;
  explicitProductRequested: boolean;
  hasPersistedDesktopSession: boolean;
  hasGuestProgress: boolean;
  resumeHistoryResult: ResumeHistoryCheckResult;
};

export function classifyResumeHistoryResponse(input: {
  status: number;
  reason?: string | null;
}): ResumeHistoryCheckResult {
  if (input.status === 200) {
    return "restored";
  }

  // Guest resume-session returns this exact payload when no auth cookie exists.
  if (input.status === 401 && input.reason === "unauthenticated") {
    return "no_history";
  }

  if (input.status === 404 && input.reason === "no_history") {
    return "no_history";
  }

  if (input.status >= 500) {
    return "failed";
  }

  return "failed";
}

export function shouldLoadWelcomeSession(
  input: ShouldLoadWelcomeSessionInput,
): boolean {
  if (input.hasActiveSession) {
    return false;
  }

  if (input.explicitProductRequested) {
    return false;
  }

  if (input.hasPersistedDesktopSession) {
    return false;
  }

  if (input.hasGuestProgress) {
    return false;
  }

  if (input.resumeHistoryResult === "restored") {
    return false;
  }

  if (input.resumeHistoryResult === "failed") {
    return false;
  }

  if (input.resumeHistoryResult !== "no_history") {
    return false;
  }

  return input.phase === "no-history";
}

export function shouldSkipInitialSessionRestore(input: {
  explicitProductRequested: boolean;
}): boolean {
  return input.explicitProductRequested;
}
