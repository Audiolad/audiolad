"use client";

import { FormEvent, useState } from "react";

import PasswordInput from "@/components/ui/PasswordInput";
import {
  EMAIL_FIELD_HINT,
  PASSWORD_MIN_LENGTH,
  SIGNUP_EMAIL_LABEL,
  SIGNUP_EXISTING_ACCOUNT_MESSAGE,
  SIGNUP_PASSWORD_HINT,
  SIGNUP_PASSWORD_LABEL,
} from "@/lib/auth/email";
import {
  evaluateSignUpClientFormState,
  type SignUpClientField,
  type SignUpClientFieldErrors,
} from "@/lib/auth/sign-up-client-form";
import {
  MAX_APEX_OFFER_HREF,
  MAX_APEX_PRIVACY_HREF,
  MAX_SHELL_SWITCH_TO_LOGIN,
  type MaxShellSignupError,
} from "@/lib/max/session-shell";

const fieldClassName =
  "mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 text-left outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]";

const fieldInvalidClassName =
  "mt-3 w-full rounded-[20px] border border-[#efc7cf] bg-white px-4 py-4 text-left outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]";

function fieldErrorId(field: SignUpClientField): string {
  return `max-sign-up-error-${field}`;
}

function errorsFromShell(
  signupError: MaxShellSignupError | null,
): { fieldErrors: SignUpClientFieldErrors; formError: string } {
  if (!signupError) {
    return { fieldErrors: {}, formError: "" };
  }
  if (signupError.field === "form") {
    return { fieldErrors: {}, formError: signupError.message };
  }
  return {
    fieldErrors: { [signupError.field]: signupError.message },
    formError: "",
  };
}

type MaxSignupFormProps = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  legalConsent: boolean;
  marketingConsent: boolean;
  submitting: boolean;
  signupError: MaxShellSignupError | null;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLegalConsentChange: (value: boolean) => void;
  onMarketingConsentChange: (value: boolean) => void;
  onClearSignupError: () => void;
  onSubmit: () => void;
  onSwitchToLogin: () => void;
};

export default function MaxSignupForm({
  firstName,
  lastName,
  email,
  password,
  legalConsent,
  marketingConsent,
  submitting,
  signupError,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onPasswordChange,
  onLegalConsentChange,
  onMarketingConsentChange,
  onClearSignupError,
  onSubmit,
  onSwitchToLogin,
}: MaxSignupFormProps) {
  const [firstNameTouched, setFirstNameTouched] = useState(false);
  const [lastNameTouched, setLastNameTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const shellErrors = errorsFromShell(signupError);
  const formState = evaluateSignUpClientFormState(
    { firstName, lastName, email, password, legalConsent },
    shellErrors.fieldErrors,
    { firstNameTouched, lastNameTouched, submitAttempted },
  );
  const isExistingAccount =
    signupError?.field === "email" &&
    signupError.message === SIGNUP_EXISTING_ACCOUNT_MESSAGE;

  function clearField(field: SignUpClientField) {
    if (
      signupError &&
      (signupError.field === field || signupError.field === "form")
    ) {
      onClearSignupError();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (!formState.isSubmitReady) {
      setSubmitAttempted(true);
      return;
    }
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 w-full max-w-sm space-y-5 text-left"
      data-testid="max-sign-up-form"
      noValidate
    >
      <label className="block">
        <span className="text-sm font-medium text-[#25135c]">Имя</span>
        <input
          type="text"
          value={firstName}
          onBlur={() => setFirstNameTouched(true)}
          onChange={(event) => {
            onFirstNameChange(event.target.value);
            clearField("firstName");
          }}
          required
          autoComplete="given-name"
          placeholder="Ваше имя"
          aria-invalid={formState.firstNameFieldInvalid}
          aria-describedby={
            formState.firstNameErrorMessage
              ? fieldErrorId("firstName")
              : undefined
          }
          className={
            formState.firstNameFieldInvalid
              ? fieldInvalidClassName
              : fieldClassName
          }
        />
        {formState.firstNameErrorMessage ? (
          <p
            id={fieldErrorId("firstName")}
            role="alert"
            className="mt-2 text-sm leading-6 text-[#b34f63]"
          >
            {formState.firstNameErrorMessage}
          </p>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#25135c]">Фамилия</span>
        <input
          type="text"
          value={lastName}
          onBlur={() => setLastNameTouched(true)}
          onChange={(event) => {
            onLastNameChange(event.target.value);
            clearField("lastName");
          }}
          required
          autoComplete="family-name"
          placeholder="Ваша фамилия"
          aria-invalid={formState.lastNameFieldInvalid}
          aria-describedby={
            formState.lastNameErrorMessage
              ? fieldErrorId("lastName")
              : undefined
          }
          className={
            formState.lastNameFieldInvalid
              ? fieldInvalidClassName
              : fieldClassName
          }
        />
        {formState.lastNameErrorMessage ? (
          <p
            id={fieldErrorId("lastName")}
            role="alert"
            className="mt-2 text-sm leading-6 text-[#b34f63]"
          >
            {formState.lastNameErrorMessage}
          </p>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#25135c]">
          {SIGNUP_EMAIL_LABEL}
        </span>
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => {
            onEmailChange(event.target.value);
            clearField("email");
          }}
          required
          autoComplete="email"
          placeholder="name@yandex.ru"
          aria-invalid={formState.emailFieldInvalid}
          aria-describedby={
            formState.emailErrorMessage
              ? fieldErrorId("email")
              : "max-sign-up-email-hint"
          }
          className={
            formState.emailFieldInvalid ? fieldInvalidClassName : fieldClassName
          }
        />
        <p
          id="max-sign-up-email-hint"
          className="mt-2 text-xs leading-5 text-[#8a7ca9]"
        >
          {EMAIL_FIELD_HINT}
        </p>
        {formState.emailErrorMessage ? (
          <p
            id={fieldErrorId("email")}
            role="alert"
            className="mt-2 text-sm leading-6 text-[#b34f63]"
          >
            {formState.emailErrorMessage}
          </p>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#25135c]">
          {SIGNUP_PASSWORD_LABEL}
        </span>
        <PasswordInput
          value={password}
          onChange={(event) => {
            onPasswordChange(event.target.value);
            clearField("password");
          }}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          aria-invalid={formState.passwordFieldInvalid}
          aria-describedby={
            formState.passwordErrorMessage
              ? fieldErrorId("password")
              : "max-sign-up-password-hint"
          }
          className={
            formState.passwordFieldInvalid
              ? fieldInvalidClassName
              : fieldClassName
          }
        />
        <p
          id="max-sign-up-password-hint"
          className="mt-2 text-xs leading-5 text-[#8a7ca9]"
        >
          {SIGNUP_PASSWORD_HINT}
        </p>
        {formState.passwordErrorMessage ? (
          <p
            id={fieldErrorId("password")}
            role="alert"
            className="mt-2 text-sm leading-6 text-[#b34f63]"
          >
            {formState.passwordErrorMessage}
          </p>
        ) : null}
      </label>

      <fieldset className="space-y-4 rounded-[20px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4">
        <legend className="sr-only">Согласия</legend>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={legalConsent}
            onChange={(event) => {
              onLegalConsentChange(event.target.checked);
              clearField("legalConsent");
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-[#7042c5]"
            aria-invalid={Boolean(shellErrors.fieldErrors.legalConsent)}
            aria-describedby={
              shellErrors.fieldErrors.legalConsent
                ? fieldErrorId("legalConsent")
                : undefined
            }
          />
          <span className="text-sm leading-6 text-[#4c3d78]">
            Я принимаю{" "}
            <a href={MAX_APEX_OFFER_HREF} className="font-semibold text-[#7042c5]">
              Пользовательское соглашение
            </a>{" "}
            и{" "}
            <a
              href={MAX_APEX_PRIVACY_HREF}
              className="font-semibold text-[#7042c5]"
            >
              Политику обработки персональных данных
            </a>
            .
          </span>
        </label>

        {shellErrors.fieldErrors.legalConsent ? (
          <p
            id={fieldErrorId("legalConsent")}
            role="alert"
            className="text-sm leading-6 text-[#b34f63]"
          >
            {shellErrors.fieldErrors.legalConsent}
          </p>
        ) : null}

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(event) => onMarketingConsentChange(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[#7042c5]"
          />
          <span className="text-sm leading-6 text-[#4c3d78]">
            Хочу получать новости АудиоЛада, рекомендации практик и специальные
            предложения по электронной почте.
            <span className="mt-1 block text-xs leading-5 text-[#8a7ca9]">
              От подписки можно отказаться в любой момент в профиле или по ссылке
              в письме.
            </span>
          </span>
        </label>
      </fieldset>

      {shellErrors.formError ? (
        <div
          role="alert"
          className="rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-4 text-sm leading-6 text-[#b34f63]"
        >
          {shellErrors.formError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !formState.isSubmitReady}
        className="primary-cta primary-cta--form"
      >
        {submitting ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </button>

      <p className="text-center text-sm text-[#7d70a2]">
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="font-semibold text-[#7042c5]"
        >
          {isExistingAccount ? "Войти в аккаунт" : MAX_SHELL_SWITCH_TO_LOGIN}
        </button>
      </p>
    </form>
  );
}
