"use client";

import BottomNav from "@/components/BottomNav";
import {
  EMAIL_FIELD_HINT,
  getEmailValidationMessage,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  validateEmailForRegistrationClient,
} from "@/lib/auth/email";
import {
  clearSignUpClientFieldError,
  evaluateSignUpClientFormState,
  type SignUpClientField,
} from "@/lib/auth/sign-up-client-form";
import {
  buildAuthRouteHref,
  SIGN_UP_DEFAULT_REDIRECT,
} from "@/lib/auth/routes";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";

import {
  getCachedAnalyticsSessionId,
  linkAnalyticsSessionUser,
  recordPlatformSignupCompleted,
  trackPlatformEvent,
} from "@/lib/analytics/client";

import { signUpAction, type SignUpFieldError } from "./actions";

function fieldErrorId(field: SignUpFieldError["field"]): string {
  return `sign-up-error-${field}`;
}

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<SignUpFieldError["field"], string>>
  >({});
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [firstNameTouched, setFirstNameTouched] = useState(false);
  const [lastNameTouched, setLastNameTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const signupStartedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const nextParam = searchParams.get("next");

  function trackSignupStartedOnce() {
    if (signupStartedRef.current) {
      return;
    }

    signupStartedRef.current = true;

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId) {
      return;
    }

    void trackPlatformEvent({
      sessionId,
      event_name: "signup_started",
      path: "/auth/sign-up",
    });
  }

  const formState = evaluateSignUpClientFormState(
    { firstName, lastName, email, password, legalConsent },
    fieldErrors,
    { firstNameTouched, lastNameTouched, submitAttempted },
  );

  function clearFieldError(field: SignUpClientField) {
    setFieldErrors((current) => clearSignUpClientFieldError(current, field));
  }

  const fieldValuesRef = useRef({
    firstName,
    lastName,
    email,
    password,
  });

  useEffect(() => {
    fieldValuesRef.current = { firstName, lastName, email, password };
  }, [email, firstName, lastName, password]);

  useEffect(() => {
    const form = formRef.current;

    if (!form) {
      return;
    }

    let cancelled = false;

    const syncAutofillValues = () => {
      if (cancelled) {
        return;
      }

      const current = fieldValuesRef.current;

      const syncField = (
        selector: string,
        fieldValue: string,
        setValue: (value: string) => void,
      ) => {
        const input = form.querySelector(selector);

        if (!(input instanceof HTMLInputElement)) {
          return;
        }

        if (input.value !== fieldValue) {
          setValue(input.value);
        }
      };

      syncField(
        'input[autocomplete="given-name"]',
        current.firstName,
        setFirstName,
      );
      syncField(
        'input[autocomplete="family-name"]',
        current.lastName,
        setLastName,
      );
      syncField('input[autocomplete="email"]', current.email, setEmail);
      syncField(
        'input[autocomplete="new-password"]',
        current.password,
        setPassword,
      );
    };

    syncAutofillValues();

    const interval = window.setInterval(syncAutofillValues, 250);
    const stopInterval = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 3000);
    form.addEventListener("focusin", syncAutofillValues);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(stopInterval);
      form.removeEventListener("focusin", syncAutofillValues);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLoading || !formState.isSubmitReady) {
      setSubmitAttempted(true);
      return;
    }

    setIsLoading(true);
    setFieldErrors({});
    setFormError("");

    const localEmailValidation = validateEmailForRegistrationClient(email);

    if (!localEmailValidation.ok) {
      setFieldErrors({
        email: getEmailValidationMessage(localEmailValidation.code),
      });
      setIsLoading(false);
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setFieldErrors({ password: PASSWORD_TOO_SHORT_MESSAGE });
      setIsLoading(false);
      return;
    }

    const result = await signUpAction({
      firstName,
      lastName,
      email,
      password,
      legalConsent,
      marketingConsent,
      next: nextParam,
    });

    if (!result.ok) {
      if (result.error.field === "form") {
        setFormError(result.error.message);
      } else {
        setFieldErrors({ [result.error.field]: result.error.message });
      }

      setIsLoading(false);
      return;
    }

    if (result.hasSession) {
      const sessionId = getCachedAnalyticsSessionId();

      if (sessionId) {
        await linkAnalyticsSessionUser();
        await recordPlatformSignupCompleted();
      }

      router.replace(result.destination || SIGN_UP_DEFAULT_REDIRECT);
      router.refresh();
      return;
    }

    router.replace(
      buildAuthRouteHref("/auth/sign-in", nextParam, { registered: "1" }),
    );
  }

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface px-5 pt-8 ${platformNavPaddingClass}`}
      >
        <header className="text-center">
          <Link href="/" className="text-[30px] font-semibold text-[#7042c5]">
            АудиоЛад
          </Link>

          <h1 className="mt-8 text-[30px] font-semibold">Создать аккаунт</h1>

          <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
            Сохраняйте практики, создавайте плейлисты и слушайте материалы на
            разных устройствах.
          </p>
        </header>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="mt-8 space-y-5"
          data-testid="sign-up-form"
          noValidate
        >
          <label className="block">
            <span className="text-sm font-medium">Имя</span>

            <input
              type="text"
              value={firstName}
              onFocus={trackSignupStartedOnce}
              onBlur={() => setFirstNameTouched(true)}
              onChange={(event) => {
                trackSignupStartedOnce();
                setFirstName(event.target.value);
                clearFieldError("firstName");
              }}
              onInput={(event) => {
                setFirstName(event.currentTarget.value);
                clearFieldError("firstName");
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
              className={`mt-3 w-full rounded-[20px] border bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5] ${
                formState.firstNameFieldInvalid
                  ? "border-[#efc7cf]"
                  : "border-[#ddcfef]"
              }`}
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
            <span className="text-sm font-medium">Фамилия</span>

            <input
              type="text"
              value={lastName}
              onBlur={() => setLastNameTouched(true)}
              onChange={(event) => {
                setLastName(event.target.value);
                clearFieldError("lastName");
              }}
              onInput={(event) => {
                setLastName(event.currentTarget.value);
                clearFieldError("lastName");
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
              className={`mt-3 w-full rounded-[20px] border bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5] ${
                formState.lastNameFieldInvalid
                  ? "border-[#efc7cf]"
                  : "border-[#ddcfef]"
              }`}
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
            <span className="text-sm font-medium">Электронная почта</span>

            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFieldError("email");
              }}
              onInput={(event) => {
                setEmail(event.currentTarget.value);
                clearFieldError("email");
              }}
              required
              autoComplete="email"
              placeholder="name@yandex.ru"
              aria-invalid={formState.emailFieldInvalid}
              aria-describedby={
                formState.emailErrorMessage
                  ? fieldErrorId("email")
                  : "sign-up-email-hint"
              }
              className={`mt-3 w-full rounded-[20px] border bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5] ${
                formState.emailFieldInvalid
                  ? "border-[#efc7cf]"
                  : "border-[#ddcfef]"
              }`}
            />

            <p
              id="sign-up-email-hint"
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
            <span className="text-sm font-medium">Пароль</span>

            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError("password");
              }}
              onInput={(event) => {
                setPassword(event.currentTarget.value);
                clearFieldError("password");
              }}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              placeholder={`Минимум ${PASSWORD_MIN_LENGTH} символов`}
              aria-invalid={formState.passwordFieldInvalid}
              aria-describedby={
                formState.passwordErrorMessage
                  ? fieldErrorId("password")
                  : undefined
              }
              className={`mt-3 w-full rounded-[20px] border bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5] ${
                formState.passwordFieldInvalid
                  ? "border-[#efc7cf]"
                  : "border-[#ddcfef]"
              }`}
            />

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
                  setLegalConsent(event.target.checked);
                  clearFieldError("legalConsent");
                }}
                className="mt-1 h-4 w-4 shrink-0 accent-[#7042c5]"
                aria-invalid={Boolean(fieldErrors.legalConsent)}
                aria-describedby={
                  fieldErrors.legalConsent
                    ? fieldErrorId("legalConsent")
                    : undefined
                }
              />
              <span className="text-sm leading-6 text-[#4c3d78]">
                Я принимаю{" "}
                <Link href="/offer" className="font-semibold text-[#7042c5]">
                  Пользовательское соглашение
                </Link>{" "}
                и{" "}
                <Link href="/privacy" className="font-semibold text-[#7042c5]">
                  Политику обработки персональных данных
                </Link>
                .
              </span>
            </label>

            {fieldErrors.legalConsent ? (
              <p
                id={fieldErrorId("legalConsent")}
                role="alert"
                className="text-sm leading-6 text-[#b34f63]"
              >
                {fieldErrors.legalConsent}
              </p>
            ) : null}

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(event) => setMarketingConsent(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[#7042c5]"
              />
              <span className="text-sm leading-6 text-[#4c3d78]">
                Хочу получать новости АудиоЛада, рекомендации практик и
                специальные предложения по электронной почте.
                <span className="mt-1 block text-xs leading-5 text-[#8a7ca9]">
                  От подписки можно отказаться в любой момент в профиле или по
                  ссылке в письме.
                </span>
              </span>
            </label>
          </fieldset>

          {formError ? (
            <div
              role="alert"
              className="rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-4 text-sm leading-6 text-[#b34f63]"
            >
              {formError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || !formState.isSubmitReady}
            aria-busy={isLoading}
            data-testid="sign-up-submit"
            className="primary-cta primary-cta--form"
          >
            {isLoading ? "Создаём аккаунт…" : "Зарегистрироваться"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#7d70a2]">
          Уже есть аккаунт?{" "}
          <Link
            href={buildAuthRouteHref("/auth/sign-in", nextParam)}
            className="font-semibold text-[#7042c5]"
          >
            Войти
          </Link>
        </p>

        <BottomNav />
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
