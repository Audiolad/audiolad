"use client";

import BottomNav from "@/components/BottomNav";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
} from "@/lib/auth/email";
import {
  PASSWORD_RESET_EXPIRED_MESSAGE,
} from "@/lib/auth/recovery-messages";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { resetPasswordAction } from "./actions";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"password" | "confirmPassword", string>>
  >({});
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      setHasSession(Boolean(user));
      setSessionChecked(true);
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const isFormReady =
    password.length >= PASSWORD_MIN_LENGTH &&
    confirmPassword.length >= PASSWORD_MIN_LENGTH;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setFieldErrors({});
    setFormError("");

    if (password.length < PASSWORD_MIN_LENGTH) {
      setFieldErrors({ password: PASSWORD_TOO_SHORT_MESSAGE });
      setIsLoading(false);
      return;
    }

    const result = await resetPasswordAction({
      password,
      confirmPassword,
      next: searchParams.get("next"),
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

    router.replace(result.destination);
    router.refresh();
  }

  if (!sessionChecked) {
    return (
      <main className="min-h-screen bg-platform-surface text-[#25135c]">
        <div
          className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface px-5 pt-8 ${platformNavPaddingClass}`}
        >
          <p className="text-center text-sm text-[#7d70a2]">Проверяем ссылку…</p>
        </div>
      </main>
    );
  }

  if (!hasSession) {
    return (
      <main className="min-h-screen bg-platform-surface text-[#25135c]">
        <div
          className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface px-5 pt-8 ${platformNavPaddingClass}`}
        >
          <header className="text-center">
            <Link href="/" className="text-[30px] font-semibold text-[#7042c5]">
              АудиоЛад
            </Link>

            <h1 className="mt-8 text-[30px] font-semibold">Смена пароля</h1>
          </header>

          <div
            role="alert"
            className="mt-8 rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-4 text-sm leading-6 text-[#b34f63]"
          >
            {PASSWORD_RESET_EXPIRED_MESSAGE}
          </div>

          <p className="mt-6 text-center text-sm text-[#7d70a2]">
            <Link
              href={buildAuthRouteHref(
                "/auth/forgot-password",
                searchParams.get("next"),
              )}
              className="font-semibold text-[#7042c5]"
            >
              Запросить новую ссылку
            </Link>
          </p>

          <BottomNav />
        </div>
      </main>
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

          <h1 className="mt-8 text-[30px] font-semibold">Создайте новый пароль</h1>

          <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
            Придумайте новый пароль для входа в аккаунт.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
          <label className="block">
            <span className="text-sm font-medium">Новый пароль</span>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              placeholder={`Минимум ${PASSWORD_MIN_LENGTH} символов`}
              aria-invalid={Boolean(fieldErrors.password)}
              className={`mt-3 w-full rounded-[20px] border bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5] ${
                fieldErrors.password ? "border-[#efc7cf]" : "border-[#ddcfef]"
              }`}
            />

            {fieldErrors.password ? (
              <p role="alert" className="mt-2 text-sm text-[#b34f63]">
                {fieldErrors.password}
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Подтверждение пароля</span>

            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              placeholder="Повторите пароль"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              className={`mt-3 w-full rounded-[20px] border bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5] ${
                fieldErrors.confirmPassword
                  ? "border-[#efc7cf]"
                  : "border-[#ddcfef]"
              }`}
            />

            {fieldErrors.confirmPassword ? (
              <p role="alert" className="mt-2 text-sm text-[#b34f63]">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </label>

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
            {isLoading ? "Сохраняем…" : "Сохранить пароль"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#7d70a2]">
          <Link
            href={buildAuthRouteHref("/auth/sign-in", searchParams.get("next"))}
            className="font-semibold text-[#7042c5]"
          >
            Вернуться ко входу
          </Link>
        </p>

        <BottomNav />
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
