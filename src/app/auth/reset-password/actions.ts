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
import { getSafeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
    console.error("password_reset_update_error", error.message);
    return {
      ok: false,
      error: {
        field: "form",
        message: PASSWORD_RESET_GENERIC_ERROR,
      },
    };
  }

  return {
    ok: true,
    destination: getSafeNextPath(input.next, "/auth/sign-in?reset=1"),
  };
}
