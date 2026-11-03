"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import PasswordInput from "@/components/ui/PasswordInput";
import { safeBusinessNextPath } from "@/lib/business-app/cabinet-mode";
import { createClient } from "@/lib/supabase/client";

/**
 * Password again on the hall device. Sign-in runs in the browser, like every other sign-in form,
 * so Supabase Auth applies its usual per-visitor limits. The server never trusts this form: it
 * reads the fresh `amr` password time from the verified session (cabinet-mode.server.ts).
 * Soft navigation afterwards, so the hall player keeps playing.
 */
export default function BusinessOwnerUnlockForm({ defaultEmail, next }: { defaultEmail: string; next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const login = email.trim();
    if (!login || !password) {
      setError("Введите почту и пароль владельца.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await createClient().auth.signInWithPassword({ email: login, password });
      if (signInError) {
        setError("Неверная почта или пароль.");
        setBusy(false);
        return;
      }
      setPassword("");
      router.replace(safeBusinessNextPath(next));
      router.refresh();
    } catch {
      setError("Не удалось проверить пароль. Попробуйте ещё раз.");
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void submit(event)} noValidate>
      <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--biz-text)]">
        Почта
        <input
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="business-app-input"
          data-testid="biz-owner-unlock-email"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--biz-text)]">
        Пароль
        <PasswordInput
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="business-app-input w-full pr-12"
          autoFocus
          data-testid="biz-owner-unlock-password"
        />
      </label>
      {error ? (
        <p className="text-sm text-[var(--biz-danger)]" role="alert" data-testid="biz-owner-unlock-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="business-app-btn business-app-btn-cta business-app-focus-ring"
        disabled={busy}
        data-testid="biz-owner-unlock-submit"
      >
        {busy ? "Проверяем…" : "Открыть кабинет"}
      </button>
      <Link href="/music" className="text-center text-sm font-semibold text-[var(--biz-accent)] underline-offset-2 hover:underline">
        Вернуться к музыке
      </Link>
    </form>
  );
}
