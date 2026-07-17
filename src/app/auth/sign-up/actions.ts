"use server";

import {
  getEmailValidationMessage,
  LISTENER_MARKETING_CONSENT_SOURCE,
  LISTENER_MARKETING_CONSENT_TEXT_VERSION,
  PASSWORD_TOO_SHORT_MESSAGE,
  SIGNUP_EXISTING_ACCOUNT_MESSAGE,
  SIGNUP_GENERIC_ERROR,
  validateEmailForRegistrationServer,
  LEGAL_CONSENT_REQUIRED_MESSAGE,
} from "@/lib/auth/email";
import {
  getSafeNextPath,
  SIGN_UP_DEFAULT_REDIRECT,
} from "@/lib/auth/routes";
import { validatePassword } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

export type SignUpFieldError = {
  field: "firstName" | "lastName" | "email" | "password" | "legalConsent" | "form";
  message: string;
};

export type SignUpActionResult =
  | {
      ok: true;
      destination: string;
      hasSession: boolean;
    }
  | {
      ok: false;
      error: SignUpFieldError;
    };

function mapSignUpAuthError(message: string): SignUpFieldError | null {
  const lower = message.toLowerCase();

  if (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists")
  ) {
    return {
      field: "email",
      message: SIGNUP_EXISTING_ACCOUNT_MESSAGE,
    };
  }

  if (
    lower.includes("password") &&
    (lower.includes("short") || lower.includes("characters"))
  ) {
    return {
      field: "password",
      message: PASSWORD_TOO_SHORT_MESSAGE,
    };
  }

  if (
    lower.includes("email") &&
    (lower.includes("invalid") || lower.includes("valid"))
  ) {
    return {
      field: "email",
      message: getEmailValidationMessage("invalid_format"),
    };
  }

  if (
    lower.includes("почтов") ||
    lower.includes("mail.ru") ||
    lower.includes("yandex") ||
    lower.includes("domain") ||
    lower.includes("signup")
  ) {
    return {
      field: "email",
      message: getEmailValidationMessage("domain_not_allowed"),
    };
  }

  return null;
}

export async function signUpAction(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  legalConsent: boolean;
  marketingConsent: boolean;
  next: string | null;
}): Promise<SignUpActionResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const password = input.password;

  if (!firstName || !lastName) {
    return {
      ok: false,
      error: {
        field: "form",
        message: "Укажите имя и фамилию.",
      },
    };
  }

  if (!input.legalConsent) {
    return {
      ok: false,
      error: {
        field: "legalConsent",
        message: LEGAL_CONSENT_REQUIRED_MESSAGE,
      },
    };
  }

  const emailValidation = validateEmailForRegistrationServer(input.email);

  if (!emailValidation.ok) {
    return {
      ok: false,
      error: {
        field: "email",
        message: getEmailValidationMessage(emailValidation.code),
      },
    };
  }

  const passwordValidation = validatePassword(password);

  if (!passwordValidation.ok) {
    return {
      ok: false,
      error: {
        field: "password",
        message: PASSWORD_TOO_SHORT_MESSAGE,
      },
    };
  }

  const supabase = await createClient();
  const destination = getSafeNextPath(input.next, SIGN_UP_DEFAULT_REDIRECT);

  const { data, error } = await supabase.auth.signUp({
    email: emailValidation.normalizedEmail,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim(),
      },
    },
  });

  if (error) {
    const mapped = mapSignUpAuthError(error.message);

    return {
      ok: false,
      error: mapped ?? {
        field: "form",
        message: SIGNUP_GENERIC_ERROR,
      },
    };
  }

  if (input.marketingConsent && data.user) {
    const { error: consentError } = await supabase.rpc(
      "record_listener_marketing_consent_signup",
      {
        p_text_version: LISTENER_MARKETING_CONSENT_TEXT_VERSION,
        p_source: LISTENER_MARKETING_CONSENT_SOURCE,
      },
    );

    if (consentError) {
      console.error("signup_marketing_consent_error", consentError.message);
    }
  }

  return {
    ok: true,
    destination,
    hasSession: Boolean(data.session),
  };
}
