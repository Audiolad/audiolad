"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import PasswordInput from "@/components/ui/PasswordInput";
import { createClient } from "@/lib/supabase/client";

type PersonalMaterialClaimedLandingProps = {
  mode: "login" | "wrong_account";
};

const fieldClassName =
  "w-full min-w-0 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]";

export default function PersonalMaterialClaimedLanding({
  mode,
}: PersonalMaterialClaimedLandingProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage("Неверный email или пароль.");
        setLoading(false);
        return;
      }

      // Reload so the server can verify claimed_by_user_id and redirect safely.
      window.location.assign(window.location.pathname);
    } catch {
      setErrorMessage("Не удалось войти. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  async function handleSwitchAccount() {
    if (loading) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
    } catch {
      setErrorMessage("Не удалось выйти из аккаунта. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#f7f4fb] px-4 py-6 pb-10 sm:py-10">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Image
            src="/brand/audiolad-logo-horizontal.png"
            alt="АудиоЛад"
            width={140}
            height={32}
            className="h-8 w-auto"
            priority
          />
          <p className="text-xs font-medium uppercase tracking-wide text-[#9a91b8]">
            Персональный материал
          </p>
        </div>

        <article className="space-y-5 rounded-3xl bg-white p-5 shadow-sm sm:p-8">
          {mode === "login" ? (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold leading-tight text-[#2f2647]">
                  Материал сохранён в вашем личном кабинете
                </h1>
                <p className="text-sm leading-6 text-[#6d628f]">
                  Войдите в аккаунт, чтобы открыть диагностику.
                </p>
              </div>

              <form className="grid gap-3" onSubmit={(event) => void handleLogin(event)}>
                <label className="block min-w-0">
                  <span className="mb-1 block text-sm font-medium text-[#5f5484]">Email</span>
                  <input
                    className={fieldClassName}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    disabled={loading}
                    required
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-sm font-medium text-[#5f5484]">Пароль</span>
                  <PasswordInput
                    className={fieldClassName}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading ? "Входим…" : "Войти и открыть диагностику"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold leading-tight text-[#2f2647]">
                  Этот материал сохранён в другом аккаунте
                </h1>
                <p className="text-sm leading-6 text-[#6d628f]">
                  Войдите в аккаунт, в котором вы сохраняли диагностику, чтобы открыть её.
                </p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSwitchAccount()}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Выходим…" : "Войти в другой аккаунт"}
              </button>
            </>
          )}

          {errorMessage ? (
            <p role="alert" className="text-sm text-[#b04444]">
              {errorMessage}
            </p>
          ) : null}
        </article>
      </div>
    </div>
  );
}
