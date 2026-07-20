"use server";

import {
  PASSWORD_RECOVERY_GENERIC_ERROR,
  PASSWORD_RECOVERY_REQUEST_MESSAGE,
} from "@/lib/auth/recovery-messages";
import { buildPasswordRecoveryRedirectUrl } from "@/lib/auth/recovery";
import { normalizeEmailInput } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function requestPasswordRecoveryAction(input: {
  email: string;
  next: string | null;
}): Promise<ForgotPasswordActionResult> {
  const normalizedEmail = normalizeEmailInput(input.email);

  if (!normalizedEmail) {
    return {
      ok: true,
      message: PASSWORD_RECOVERY_REQUEST_MESSAGE,
    };
  }

  const supabase = await createClient();
  const redirectTo = buildPasswordRecoveryRedirectUrl(input.next);

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo,
  });

  if (error) {
    console.error("password_recovery_request_error", error.message);
    return {
      ok: false,
      message: PASSWORD_RECOVERY_GENERIC_ERROR,
    };
  }

  return {
    ok: true,
    message: PASSWORD_RECOVERY_REQUEST_MESSAGE,
  };
}
