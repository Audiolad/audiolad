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
import { buildResetPasswordRouteWithNext } from "@/lib/auth/recovery";
import { resolveValidatedNextPath } from "@/lib/auth/routes";
import { PASSWORD_RESET_EXPIRED_MESSAGE } from "@/lib/auth/recovery-messages";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type RecoveryActionResult =
  | { ok: true; destination?: string }
  | { ok: false; message: string };

const invalidResult = (): RecoveryActionResult => ({
  ok: false,
  message: PASSWORD_RESET_EXPIRED_MESSAGE,
});

function clearStageCookie(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(RECOVERY_STAGE_COOKIE, "", {
    ...recoveryStageCookieOptions(),
    maxAge: 0,
  });
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

/** The explicit user-confirmed, single consuming recovery operation. */
export async function verifyRecoveryTokenAction(): Promise<RecoveryActionResult> {
  const cookieStore = await cookies();
  const stage = readRecoveryStage(cookieStore);
  clearStageCookie(cookieStore);
  if (!stage) return invalidResult();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: stage.tokenHash,
    type: "recovery",
  });

  if (error || !data.user) {
    console.warn("password_recovery_verify_failure", {
      reason: "invalid_or_expired",
    });
    return invalidResult();
  }

  cookieStore.set(
    RECOVERY_INTENT_COOKIE,
    createRecoveryIntent(data.user.id),
    recoveryIntentCookieOptions(),
  );
  console.info("password_recovery_verify_success");

  return {
    ok: true,
    destination: buildResetPasswordRouteWithNext(stage.next),
  };
}
