"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function SignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        },
      },
    });

    if (error) {
      setIsError(true);
      setMessage(error.message || "Не удалось создать аккаунт.");
      setIsLoading(false);
      return;
    }

    if (data.session) {
      router.replace("/my-practices");
      router.refresh();
      return;
    }

    router.replace("/auth/sign-in?registered=1");
  }

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface px-5 pb-10 pt-8">
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

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Имя</span>

            <input
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
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
              minLength={6}
              autoComplete="new-password"
              placeholder="Минимум 6 символов"
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
            {isLoading ? "Создаём аккаунт…" : "Зарегистрироваться"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#7d70a2]">
          Уже есть аккаунт?{" "}
          <Link href="/auth/sign-in" className="font-semibold text-[#7042c5]">
            Войти
          </Link>
        </p>

        <p className="mt-6 text-center text-xs leading-5 text-[#9a8daf]">
          Регистрируясь, вы принимаете пользовательское соглашение и политику
          конфиденциальности.
        </p>
      </div>
    </main>
  );
}