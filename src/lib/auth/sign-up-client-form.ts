import {
  getEmailValidationMessage,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  validateEmailForRegistrationClient,
} from "@/lib/auth/email";
import type { EmailValidationResult } from "@/lib/auth/email";

export type SignUpClientField =
  | "firstName"
  | "lastName"
  | "email"
  | "password"
  | "legalConsent"
  | "form";

export type SignUpClientFieldErrors = Partial<
  Record<SignUpClientField, string>
>;

export type SignUpClientFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  legalConsent: boolean;
};

export type SignUpClientFormInteraction = {
  firstNameTouched?: boolean;
  lastNameTouched?: boolean;
  submitAttempted?: boolean;
};

export const SIGNUP_FIRST_NAME_REQUIRED_MESSAGE = "Укажите имя";
export const SIGNUP_LAST_NAME_REQUIRED_MESSAGE = "Укажите фамилию";

export type SignUpClientFormState = {
  trimmedFirstName: string;
  trimmedLastName: string;
  firstNameErrorMessage: string | null;
  lastNameErrorMessage: string | null;
  emailValidation: EmailValidationResult | null;
  emailErrorMessage: string | null;
  passwordErrorMessage: string | null;
  firstNameFieldInvalid: boolean;
  lastNameFieldInvalid: boolean;
  emailFieldInvalid: boolean;
  passwordFieldInvalid: boolean;
  isSubmitReady: boolean;
};

function liveEmailErrorMessage(
  emailValidation: EmailValidationResult | null,
): string | null {
  if (!emailValidation || emailValidation.ok) {
    return null;
  }

  return getEmailValidationMessage(emailValidation.code);
}

function livePasswordErrorMessage(password: string): string | null {
  if (password.length === 0 || password.length >= PASSWORD_MIN_LENGTH) {
    return null;
  }

  return PASSWORD_TOO_SHORT_MESSAGE;
}

function liveNameErrorMessage(
  trimmedName: string,
  showValidation: boolean,
  emptyMessage: string,
): string | null {
  if (!showValidation || trimmedName.length > 0) {
    return null;
  }

  return emptyMessage;
}

/** Single client-side source of truth for sign-up field errors and submit readiness. */
export function evaluateSignUpClientFormState(
  values: SignUpClientFormValues,
  fieldErrors: SignUpClientFieldErrors = {},
  interaction: SignUpClientFormInteraction = {},
): SignUpClientFormState {
  const trimmedFirstName = values.firstName.trim();
  const trimmedLastName = values.lastName.trim();
  const trimmedEmail = values.email.trim();
  const emailValidation = trimmedEmail
    ? validateEmailForRegistrationClient(values.email)
    : null;

  const showFirstNameValidation =
    Boolean(interaction.firstNameTouched) || Boolean(interaction.submitAttempted);
  const showLastNameValidation =
    Boolean(interaction.lastNameTouched) || Boolean(interaction.submitAttempted);

  const firstNameErrorMessage =
    fieldErrors.firstName ??
    liveNameErrorMessage(
      trimmedFirstName,
      showFirstNameValidation,
      SIGNUP_FIRST_NAME_REQUIRED_MESSAGE,
    );
  const lastNameErrorMessage =
    fieldErrors.lastName ??
    liveNameErrorMessage(
      trimmedLastName,
      showLastNameValidation,
      SIGNUP_LAST_NAME_REQUIRED_MESSAGE,
    );
  const emailErrorMessage =
    fieldErrors.email ?? liveEmailErrorMessage(emailValidation);
  const passwordErrorMessage =
    fieldErrors.password ?? livePasswordErrorMessage(values.password);

  const firstNameFieldInvalid = Boolean(firstNameErrorMessage);
  const lastNameFieldInvalid = Boolean(lastNameErrorMessage);
  const emailFieldInvalid = Boolean(emailErrorMessage);
  const passwordFieldInvalid = Boolean(passwordErrorMessage);

  const isSubmitReady =
    trimmedFirstName.length > 0 &&
    trimmedLastName.length > 0 &&
    !fieldErrors.firstName &&
    !fieldErrors.lastName &&
    trimmedEmail.length > 0 &&
    emailValidation?.ok === true &&
    !fieldErrors.email &&
    values.password.length >= PASSWORD_MIN_LENGTH &&
    !fieldErrors.password &&
    values.legalConsent &&
    !fieldErrors.legalConsent;

  return {
    trimmedFirstName,
    trimmedLastName,
    firstNameErrorMessage,
    lastNameErrorMessage,
    emailValidation,
    emailErrorMessage,
    passwordErrorMessage,
    firstNameFieldInvalid,
    lastNameFieldInvalid,
    emailFieldInvalid,
    passwordFieldInvalid,
    isSubmitReady,
  };
}

export function clearSignUpClientFieldError(
  fieldErrors: SignUpClientFieldErrors,
  field: SignUpClientField,
): SignUpClientFieldErrors {
  if (!fieldErrors[field]) {
    return fieldErrors;
  }

  const next = { ...fieldErrors };
  delete next[field];
  return next;
}
