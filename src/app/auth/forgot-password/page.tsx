"use client";

import BottomNav from "@/components/BottomNav";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import {
  PASSWORD_RECOVERY_RATE_LIMIT_MESSAGE,
} from "@/lib/auth/recovery-messages";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";

import { requestPasswordRecoveryAction } from "./actions";

const COOLDOWN_MS = 60_000;

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    if (cooldownRemainingMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      const remaining = Math.max(0, cooldownUntilRef.current - Date.now());

      setCooldownRemainingMs(remaining);

      if (remaining <= 0) {
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [cooldownRemainingMs]);

  const isFormReady = email.trim().length > 0 && cooldownRemainingMs <= 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (cooldownRemainingMs > 0) {
      setIsError(true);
      setMessage(PASSWORD_RECOVERY_RATE_LIMIT_MESSAGE);
      return;
    }

    setIsLoading(true);
    setMessage("");
    setIsError(false);

    const result = await requestPasswordRecoveryAction({ email });

    cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    setCooldownRemainingMs(COOLDOWN_MS);

    setIsError(!result.ok);
    setMessage(result.message);
    setIsLoading(false);
  }

  const cooldownSeconds = Math.ceil(cooldownRemainingMs / 1000);

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface px-5 pt-8 ${platformNavPaddingClass}`}
      >
        <header className="text-center">
          <Link href="/" className="text-[30px] font-semibold text-[#7042c5]">
            АудиоЛад
          </Link>

          <h1 className="mt-8 text-[30px] font-semibold">Восстановление пароля</h1>

          <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
            Укажите email, который использовали при регистрации. Мы отправим
            инструкции, если аккаунт существует.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
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
              className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
            />
          </label>

          {message ? (
            <div
              role="alert"
              className={`rounded-[18px] border px-4 py-4 text-sm leading-6 ${
                isError
                  ? "border-[#efc7cf] bg-[#fff8f9] text-[#b34f63]"
                  : "border-[#cfe8d9] bg-[#f3fbf6] text-[#3d8d65]"
              }`}
            >
              {message}
            </div>
          ) : null}

          {cooldownRemainingMs > 0 ? (
            <p className="text-center text-xs text-[#8a7ca9]">
              Повторная отправка будет доступна через {cooldownSeconds} сек.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || !isFormReady}
            aria-busy={isLoading}
            className="primary-cta primary-cta--form"
          >
            {isLoading ? "Отправляем…" : "Отправить инструкции"}
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

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
