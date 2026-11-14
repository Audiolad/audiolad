import type { SupabaseClient, User } from "@supabase/supabase-js";
import { normalizeBusinessReceiptEmail } from "@/lib/business/subscription-checkout";
import { isNewEmailDomainAllowed, NEW_EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE } from "@/lib/auth/email";

export const RECEIPT_EMAIL_TAKEN_MESSAGE = "Эта почта уже привязана к другому аккаунту. Войдите в него или укажите другую почту.";
export const LOGIN_EMAIL_RETRY_MESSAGE = "Не удалось сохранить почту. Попробуйте ещё раз.";

/** Only the caller returned by auth.getUser may be passed here. Never accepts an id from a form. */
export async function linkBusinessLoginEmail(supabase: Pick<SupabaseClient, "auth">, user: User, raw: unknown) {
  if (!user.is_anonymous) return { ok: true, linked: false } as const;
  const email = normalizeBusinessReceiptEmail(raw);
  if (!email) return { ok: false, code: "receipt_email_required", error: "Проверьте почту – похоже, в адресе ошибка." } as const;
  // t1446u: a new login email – Russian mail services only (same list as audiolad.ru sign-up).
  if (!isNewEmailDomainAllowed(email)) return { ok: false, code: "receipt_email_domain_not_allowed", error: NEW_EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE } as const;
  try {
    // GoTrue autoconfirm promotes this SAME anonymous user. No admin privileges or merge.
    const { data, error } = await supabase.auth.updateUser({
      email,
      data: { receipt_email: email, business_login_linked: true },
    });
    if (error) {
      const taken = error.code === "email_exists" || error.code === "email_address_in_use";
      return { ok: false, code: taken ? "receipt_email_taken" : "login_email_failed",
        error: taken ? RECEIPT_EMAIL_TAKEN_MESSAGE : LOGIN_EMAIL_RETRY_MESSAGE } as const;
    }
    if (!data.user || data.user.id !== user.id || data.user.is_anonymous || data.user.email?.toLowerCase() !== email || !data.user.email_confirmed_at) {
      return { ok: false, code: "login_email_failed", error: LOGIN_EMAIL_RETRY_MESSAGE } as const;
    }
    // Refresh the JWT too: is_anonymous is used by the existing RLS policies.
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) return { ok: false, code: "login_email_failed", error: LOGIN_EMAIL_RETRY_MESSAGE } as const;
    return { ok: true, linked: true } as const;
  } catch {
    return { ok: false, code: "login_email_failed", error: LOGIN_EMAIL_RETRY_MESSAGE } as const;
  }
}

/** A flag records successful password saves. Email identities alone do not prove a password exists. */
export function businessPasswordState(user: Pick<User, "user_metadata" | "is_anonymous">): "set" | "unset" | "unknown" {
  if (user.user_metadata.business_password_saved === true) return "set";
  if (user.is_anonymous || user.user_metadata.business_login_linked === true) return "unset";
  return "unknown";
}

export function businessPasswordError(password: unknown, repeat: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) return "Пароль должен содержать не меньше 8 символов.";
  if (password.length > 128) return "Пароль должен содержать не больше 128 символов.";
  return password === repeat ? null : "Пароли не совпадают.";
}
