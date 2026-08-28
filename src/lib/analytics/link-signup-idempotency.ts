/**
 * Mirrors the SQL early-return policy for link/signup RPCs.
 * Used by unit tests and the stampede model. Keep predicates aligned with
 * supabase/migrations/20260901120000_analytics_link_signup_idempotent.sql
 */

export type LinkEarlyReturnInput = {
  sessionFound: boolean;
  sessionUserId: string | null;
  callerUserId: string;
  hasActiveIdentityLink: boolean;
};

export type SignupEarlyReturnInput = {
  authenticated: boolean;
  alreadyRecordedSignup: boolean;
};

export function classifyLinkAnalyticsSessionUser(
  input: LinkEarlyReturnInput,
): "reject" | "fast_noop" | "heavy" {
  if (!input.sessionFound) {
    return "reject";
  }

  if (
    input.sessionUserId === input.callerUserId &&
    input.hasActiveIdentityLink
  ) {
    return "fast_noop";
  }

  return "heavy";
}

export function classifyRecordPlatformSignupCompleted(
  input: SignupEarlyReturnInput,
): "reject" | "already_recorded" | "continue" {
  if (!input.authenticated) {
    return "reject";
  }

  if (input.alreadyRecordedSignup) {
    return "already_recorded";
  }

  return "continue";
}
