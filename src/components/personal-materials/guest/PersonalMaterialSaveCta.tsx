"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import PasswordInput from "@/components/ui/PasswordInput";
import {
  EMAIL_FIELD_HINT,
  getEmailValidationMessage,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  validateEmailForRegistrationClient,
} from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/client";

type PersonalMaterialSaveCtaProps = {
  isAuthenticated: boolean;
  claimApiPath: string;
  claimContextApiPath: string;
  claimCompletePath: string;
  materialId: string;
  clientFirstName: string;
  clientLastName: string | null;
};

type AuthMode = "register" | "login";
type SaveState = "idle" | "loading" | "success" | "error";

const fieldClassName =
  "w-full min-w-0 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]";

export default function PersonalMaterialSaveCta({
  isAuthenticated,
  claimApiPath,
  claimContextApiPath,
  materialId,
  clientFirstName,
  clientLastName,
}: PersonalMaterialSaveCtaProps) {
  const [mode, setMode] = useState<AuthMode>("register");
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(clientFirstName);
  const [lastName, setLastName] = useState(clientLastName ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);

  const claimAndRedirect = useCallback(async () => {
    const response = await fetch(claimApiPath, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) {
      throw new Error("Материал больше недоступен для сохранения.");
    }

    if (response.status === 401) {
      throw new Error("Войдите в аккаунт, чтобы сохранить диагностику.");
    }

    if (!response.ok) {
      throw new Error("Не удалось сохранить диагностику. Попробуйте ещё раз.");
    }

    const payload = (await response.json()) as { materialId?: string };
    const targetId = payload.materialId ?? materialId;
    setState("success");
    window.location.assign(`/my-materials/${encodeURIComponent(targetId)}`);
  }, [claimApiPath, materialId]);

  const handleAuthenticatedClaim = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    try {
      await claimAndRedirect();
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    }
  }, [claimAndRedirect]);

  const handleRegister = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setState("error");
      setErrorMessage("Укажите имя.");
      return;
    }

    if (!legalConsent) {
      setState("error");
      setErrorMessage("Нужно согласие с условиями сервиса.");
      return;
    }

    const emailValidation = validateEmailForRegistrationClient(email);
    if (!emailValidation.ok) {
      setState("error");
      setErrorMessage(getEmailValidationMessage(emailValidation.code));
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setState("error");
      setErrorMessage(PASSWORD_TOO_SHORT_MESSAGE);
      return;
    }

    try {
      const contextResponse = await fetch(claimContextApiPath, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (!contextResponse.ok) {
        throw new Error("Не удалось подготовить сохранение. Попробуйте ещё раз.");
      }

      const supabase = createClient();
      const trimmedLast = lastName.trim();
      const { data, error } = await supabase.auth.signUp({
        email: emailValidation.normalizedEmail,
        password,
        options: {
          data: {
            first_name: trimmedFirst,
            last_name: trimmedLast,
            full_name: trimmedLast
              ? `${trimmedFirst} ${trimmedLast}`
              : trimmedFirst,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.session) {
        const signIn = await supabase.auth.signInWithPassword({
          email: emailValidation.normalizedEmail,
          password,
        });

        if (signIn.error || !signIn.data.session) {
          throw new Error(
            "Аккаунт создан. Войдите в режиме «Уже есть аккаунт», чтобы сохранить диагностику.",
          );
        }
      }

      await claimAndRedirect();
    } catch (error) {
      setState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось создать кабинет.",
      );
    }
  }, [
    claimAndRedirect,
    claimContextApiPath,
    email,
    firstName,
    lastName,
    legalConsent,
    password,
  ]);

  const handleLogin = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setState("error");
      setErrorMessage("Укажите email и пароль.");
      return;
    }

    try {
      const contextResponse = await fetch(claimContextApiPath, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (!contextResponse.ok) {
        throw new Error("Не удалось подготовить сохранение. Попробуйте ещё раз.");
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw new Error("Неверный email или пароль.");
      }

      await claimAndRedirect();
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось войти.");
    }
  }, [claimAndRedirect, claimContextApiPath, email, password]);

  if (state === "success") {
    return (
      <section className="space-y-3 rounded-2xl bg-[#eef8f1] p-5">
        <p className="text-base font-semibold text-[#2f6b4a]">Диагностика сохранена</p>
        <p className="text-sm text-[#3d6650]">Открываем личный кабинет…</p>
      </section>
    );
  }

  if (isAuthenticated) {
    return (
      <section className="space-y-3 rounded-2xl border border-[#eadff8] bg-[#faf6ff] p-5">
        <h2 className="text-lg font-semibold text-[#2f2647]">
          Сохраните диагностику в личном кабинете
        </h2>
        <p className="text-sm leading-6 text-[#6d628f]">
          Материал появится в разделе «Личные материалы». Публичная ссылка закроется после
          успешного сохранения.
        </p>
        <button
          type="button"
          onClick={() => void handleAuthenticatedClaim()}
          disabled={state === "loading"}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {state === "loading" ? "Сохраняем…" : "Добавить в личный кабинет"}
        </button>
        {errorMessage ? (
          <p role="alert" className="text-sm text-[#b04444]">
            {errorMessage}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[#eadff8] bg-[#faf6ff] p-5">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-[#2f2647]">
          Сохраните диагностику в личном кабинете
        </h2>
        <p className="text-sm leading-6 text-[#6d628f]">
          Создайте бесплатный аккаунт, чтобы диагностика сохранилась у вас и была доступна в
          любое время.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`min-h-11 rounded-full px-3 text-sm font-semibold ${
            mode === "register"
              ? "bg-[#7042c5] text-white"
              : "border border-[#e4d7f4] bg-white text-[#7042c5]"
          }`}
        >
          Зарегистрироваться
        </button>
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`min-h-11 rounded-full px-3 text-sm font-semibold ${
            mode === "login"
              ? "bg-[#7042c5] text-white"
              : "border border-[#e4d7f4] bg-white text-[#7042c5]"
          }`}
        >
          Уже есть аккаунт
        </button>
      </div>

      {mode === "register" ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (state !== "loading") {
              void handleRegister();
            }
          }}
        >
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium text-[#5f5484]">Имя</span>
            <input
              className={fieldClassName}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              disabled={state === "loading"}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium text-[#5f5484]">Фамилия</span>
            <input
              className={fieldClassName}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Если есть"
              autoComplete="family-name"
              disabled={state === "loading"}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium text-[#5f5484]">Email</span>
            <input
              className={fieldClassName}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={state === "loading"}
            />
            <span className="mt-1 block text-xs text-[#7d70a2]">{EMAIL_FIELD_HINT}</span>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium text-[#5f5484]">Пароль</span>
            <PasswordInput
              className={fieldClassName}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              disabled={state === "loading"}
            />
          </label>
          <label className="flex items-start gap-3 text-sm leading-6 text-[#5f5484]">
            <input
              type="checkbox"
              className="mt-1"
              checked={legalConsent}
              onChange={(event) => setLegalConsent(event.target.checked)}
              disabled={state === "loading"}
            />
            <span>
              Согласен с{" "}
              <Link href="/offer" className="text-[#7042c5] underline">
                офертой
              </Link>{" "}
              и{" "}
              <Link href="/privacy" className="text-[#7042c5] underline">
                политикой конфиденциальности
              </Link>
              .
            </span>
          </label>
          <button
            type="submit"
            disabled={state === "loading"}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {state === "loading" ? "Сохраняем…" : "Создать кабинет и сохранить диагностику"}
          </button>
        </form>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (state !== "loading") {
              void handleLogin();
            }
          }}
        >
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium text-[#5f5484]">Email</span>
            <input
              className={fieldClassName}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={state === "loading"}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium text-[#5f5484]">Пароль</span>
            <PasswordInput
              className={fieldClassName}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={state === "loading"}
            />
          </label>
          <button
            type="submit"
            disabled={state === "loading"}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {state === "loading" ? "Сохраняем…" : "Войти и сохранить диагностику"}
          </button>
        </form>
      )}

      {errorMessage ? (
        <p role="alert" className="text-sm text-[#b04444]">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
