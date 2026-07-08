"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

    router.push("/profile");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] px-5 pb-10 pt-8 shadow-sm">
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
            disabled={isLoading}
            className="w-full rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 text-[17px] font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Входим…" : "Войти"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#7d70a2]">
          Нет аккаунта?{" "}
          <Link href="/sign-up" className="font-semibold text-[#7042c5]">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </main>
  );
}