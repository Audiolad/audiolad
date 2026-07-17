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
  buildAuthRouteHref,
  SIGN_UP_DEFAULT_REDIRECT,
} from "@/lib/auth/routes";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useRef, useState } from "react";

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
  const signupStartedRef = useRef(false);

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

  const clientEmailValidation = useMemo(
    () => (email.trim() ? validateEmailForRegistrationClient(email) : null),
    [email],
  );

  const emailInvalid =
    clientEmailValidation !== null && !clientEmailValidation.ok;

  const isFormReady =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= PASSWORD_MIN_LENGTH &&
    legalConsent &&
    !emailInvalid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
              onChange={(event) => {
                trackSignupStartedOnce();
                setFirstName(event.target.value);
              }}
              required
              autoComplete="given-name"
              placeholder="Ваше имя"
              className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Фамилия</span>

            <input
              type="text"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
              autoComplete="family-name"
              placeholder="Ваша фамилия"
              className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Электронная почта</span>

            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="name@yandex.ru"
              aria-invalid={emailInvalid || Boolean(fieldErrors.email)}
              aria-describedby={
                fieldErrors.email
                  ? fieldErrorId("email")
                  : "sign-up-email-hint"
              }
              className={`mt-3 w-full rounded-[20px] border bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5] ${
                emailInvalid || fieldErrors.email
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

            {fieldErrors.email ? (
              <p
                id={fieldErrorId("email")}
                role="alert"
                className="mt-2 text-sm leading-6 text-[#b34f63]"
              >
                {fieldErrors.email}
              </p>
            ) : emailInvalid && clientEmailValidation ? (
              <p
                id={fieldErrorId("email")}
                role="alert"
                className="mt-2 text-sm leading-6 text-[#b34f63]"
              >
                {getEmailValidationMessage(clientEmailValidation.code)}
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Пароль</span>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              placeholder={`Минимум ${PASSWORD_MIN_LENGTH} символов`}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password ? fieldErrorId("password") : undefined
              }
              className={`mt-3 w-full rounded-[20px] border bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5] ${
                fieldErrors.password ? "border-[#efc7cf]" : "border-[#ddcfef]"
              }`}
            />

            {fieldErrors.password ? (
              <p
                id={fieldErrorId("password")}
                role="alert"
                className="mt-2 text-sm leading-6 text-[#b34f63]"
              >
                {fieldErrors.password}
              </p>
            ) : null}
          </label>

          <fieldset className="space-y-4 rounded-[20px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4">
            <legend className="sr-only">Согласия</legend>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={legalConsent}
                onChange={(event) => setLegalConsent(event.target.checked)}
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
            disabled={isLoading || !isFormReady}
            aria-busy={isLoading}
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
