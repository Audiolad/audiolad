"use server";

import {
  PASSWORD_TOO_SHORT_MESSAGE,
} from "@/lib/auth/email";
import {
  PASSWORD_RESET_GENERIC_ERROR,
  PASSWORD_RESET_MISMATCH_MESSAGE,
} from "@/lib/auth/recovery-messages";
import {
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth/password";
import { buildPostPasswordResetSignInHref } from "@/lib/auth/recovery";
import {
  hasValidRecoveryIntent,
  RECOVERY_INTENT_COOKIE,
  RECOVERY_STAGE_COOKIE,
  recoveryIntentCookieOptions,
  recoveryStageCookieOptions,
} from "@/lib/auth/recovery-intent";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export type ResetPasswordFieldError = {
  field: "password" | "confirmPassword" | "form";
  message: string;
};

export type ResetPasswordActionResult =
  | { ok: true; destination: string }
  | { ok: false; error: ResetPasswordFieldError };

export async function resetPasswordAction(input: {
  password: string;
  confirmPassword: string;
  next: string | null;
}): Promise<ResetPasswordActionResult> {
  const cookieStore = await cookies();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    cookieStore.set(RECOVERY_INTENT_COOKIE, "", {
      ...recoveryIntentCookieOptions(),
      maxAge: 0,
    });
    return {
      ok: false,
      error: {
        field: "form",
        message: PASSWORD_RESET_GENERIC_ERROR,
      },
    };
  }

  if (!hasValidRecoveryIntent(cookieStore, user.id)) {
    cookieStore.set(RECOVERY_INTENT_COOKIE, "", {
      ...recoveryIntentCookieOptions(),
      maxAge: 0,
    });
    return {
      ok: false,
      error: {
        field: "form",
        message: PASSWORD_RESET_GENERIC_ERROR,
      },
    };
  }

  const passwordValidation = validatePassword(input.password);

  if (!passwordValidation.ok) {
    return {
      ok: false,
      error: {
        field: "password",
        message: PASSWORD_TOO_SHORT_MESSAGE,
      },
    };
  }

  if (!validatePasswordConfirmation(input.password, input.confirmPassword)) {
    return {
      ok: false,
      error: {
        field: "confirmPassword",
        message: PASSWORD_RESET_MISMATCH_MESSAGE,
      },
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: input.password,
  });

  if (error) {
    console.warn("password_reset_update_failure", { reason: "update_failed" });
    return {
      ok: false,
      error: {
        field: "form",
        message: PASSWORD_RESET_GENERIC_ERROR,
      },
    };
  }

  cookieStore.set(RECOVERY_INTENT_COOKIE, "", {
    ...recoveryIntentCookieOptions(),
    maxAge: 0,
  });
  cookieStore.set(RECOVERY_STAGE_COOKIE, "", {
    ...recoveryStageCookieOptions(),
    maxAge: 0,
  });
  await supabase.auth.signOut({ scope: "local" });
  console.info("password_reset_update_success");

  return {
    ok: true,
    destination: buildPostPasswordResetSignInHref(input.next),
  };
}
