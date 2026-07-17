import { PASSWORD_MIN_LENGTH } from "@/lib/auth/email/messages";

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; code: "empty" | "too_short" };

export function validatePassword(raw: string): PasswordValidationResult {
  if (!raw) {
    return { ok: false, code: "empty" };
  }

  if (raw.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, code: "too_short" };
  }

  return { ok: true };
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): boolean {
  return password.length > 0 && password === confirmation;
}
