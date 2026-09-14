"use server";

import {
  createRecoveryIntent,
  createRecoveryStage,
  readRecoveryStage,
  RECOVERY_INTENT_COOKIE,
  RECOVERY_STAGE_COOKIE,
  recoveryIntentCookieOptions,
  recoveryStageCookieOptions,
} from "@/lib/auth/recovery-intent";
import {
  decideRecoveryVerifyAction,
  decideStageCookieAfterVerify,
  type RecoveryVerifyStatus,
} from "@/lib/auth/recovery-continue";
import { buildResetPasswordRouteWithNext } from "@/lib/auth/recovery";
import { resolveValidatedNextPath } from "@/lib/auth/routes";
import {
  PASSWORD_RESET_EXPIRED_MESSAGE,
  PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
  PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR,
} from "@/lib/auth/recovery-messages";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type RecoveryActionResult =
  | { ok: true; destination?: string }
  | { ok: false; message: string };

const invalidResult = (): RecoveryActionResult => ({
  ok: false,
  message: PASSWORD_RESET_EXPIRED_MESSAGE,
});

const temporaryResult = (): RecoveryActionResult => ({
  ok: false,
  message: PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
});

const nonRetryableConsumedResult = (): RecoveryActionResult => ({
  ok: false,
  message: PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR,
});

function clearStageCookie(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(RECOVERY_STAGE_COOKIE, "", {
    ...recoveryStageCookieOptions(),
    maxAge: 0,
  });
}

function applyStageDecision(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  verifyStatus: RecoveryVerifyStatus,
) {
  // Keep production stage clears on the same helper the unit suite executes.
  void decideRecoveryVerifyAction({ verifyStatus });
  if (decideStageCookieAfterVerify({ verifyStatus }) === "clear") {
    clearStageCookie(cookieStore);
  }
}

/** Stores the fragment credential server-side after removing it from the URL. */
export async function stageRecoveryTokenAction(input: {
  tokenHash: string;
  next: string | null;
}): Promise<RecoveryActionResult> {
  const stage = createRecoveryStage(
    input.tokenHash,
    resolveValidatedNextPath(input.next),
  );
  if (!stage) return invalidResult();

  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_STAGE_COOKIE, stage, recoveryStageCookieOptions());
  return { ok: true };
}

/**
 * Explicit user-confirmed consuming recovery operation.
 * Only pre-terminal verify exceptions remain retryable; after verifyOtp
 * success the recovery token is consumed and failures are non-retryable.
 */
export async function verifyRecoveryTokenAction(): Promise<RecoveryActionResult> {
  console.info("password_recovery_verify_started");

  const cookieStore = await cookies();
  const stage = readRecoveryStage(cookieStore);
  if (!stage) {
    console.warn("password_recovery_verify_failure", {
      reason: "missing_stage",
    });
    return invalidResult();
  }

  let data: { user: { id: string } | null } | null = null;
  let error: unknown = null;

  // PHASE 1 — verify not yet resolved. Only this catch is retryable.
  try {
    const supabase = await createClient();
    const result = await supabase.auth.verifyOtp({
      token_hash: stage.tokenHash,
      type: "recovery",
    });
    data = result.data;
    error = result.error;
  } catch {
    applyStageDecision(cookieStore, "verify_not_resolved_exception");
    console.warn("password_recovery_verify_exception", {
      reason: "verify_not_resolved",
    });
    return temporaryResult();
  }

  if (error || !data?.user) {
    applyStageDecision(cookieStore, "invalid_or_expired");
    console.warn("password_recovery_verify_failure", {
      reason: "invalid_or_expired",
    });
    return invalidResult();
  }

  // PHASE 2 — terminal verify success: token is consumed. Never retry.
  try {
    cookieStore.set(
      RECOVERY_INTENT_COOKIE,
      createRecoveryIntent(data.user.id),
      recoveryIntentCookieOptions(),
    );
    applyStageDecision(cookieStore, "success");
    console.info("password_recovery_verify_success");

    return {
      ok: true,
      destination: buildResetPasswordRouteWithNext(stage.next),
    };
  } catch {
    applyStageDecision(cookieStore, "post_verify_failure");
    console.warn("password_recovery_post_verify_failure", {
      reason: "post_success",
    });
    return nonRetryableConsumedResult();
  }
}
