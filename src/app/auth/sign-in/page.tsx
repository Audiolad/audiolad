"use client";

import BottomNav from "@/components/BottomNav";
import { buildAuthRouteHref, getSafeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/client";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegistered = searchParams.get("registered") === "1";
  const isReset = searchParams.get("reset") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isFormReady = email.trim().length > 0 && password.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setMessage("");
    setIsError(false);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setIsError(true);
      setMessage("Не удалось войти. Проверьте email и пароль.");
      setIsLoading(false);
      return;
    }

    const destination = getSafeNextPath(searchParams.get("next"));

    router.replace(destination);
    router.refresh();
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

          <h1 className="mt-8 text-[30px] font-semibold">Войти</h1>

          <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
            Войдите в аккаунт, чтобы продолжить слушать практики и управлять
            своей коллекцией.
          </p>
        </header>

        {isRegistered && (
          <div className="mt-8 rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-4 text-sm leading-6 text-[#3d8d65]">
            Регистрация прошла успешно.
            <br />
            Теперь войдите в аккаунт.
          </div>
        )}

        {isReset && (
          <div className="mt-8 rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-4 text-sm leading-6 text-[#3d8d65]">
            Пароль обновлён. Войдите с новым паролем.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Электронная почта</span>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="name@example.com"
              className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Пароль</span>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              placeholder="Введите пароль"
              className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
            />

            <p className="mt-2 text-right text-sm">
              <Link
                href={buildAuthRouteHref(
                  "/auth/forgot-password",
                  searchParams.get("next"),
                )}
                className="font-medium text-[#7042c5]"
              >
                Забыли пароль?
              </Link>
            </p>
          </label>

          {message && (
            <div
              className={`rounded-[18px] border px-4 py-4 text-sm leading-6 ${
                isError
                  ? "border-[#efc7cf] bg-[#fff8f9] text-[#b34f63]"
                  : "border-[#cfe8d9] bg-[#f3fbf6] text-[#3d8d65]"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !isFormReady}
            className="primary-cta primary-cta--form"
          >
            {isLoading ? "Входим…" : "Войти"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#7d70a2]">
          Нет аккаунта?{" "}
          <Link
            href={buildAuthRouteHref("/auth/sign-up", searchParams.get("next"))}
            className="font-semibold text-[#7042c5]"
          >
            Зарегистрироваться
          </Link>
        </p>

        <BottomNav />
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
