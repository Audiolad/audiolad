"use client";

import { FormEvent } from "react";

import PasswordInput from "@/components/ui/PasswordInput";
import { MAX_APEX_FORGOT_PASSWORD_HREF } from "@/lib/max/session-shell";

const fieldClassName =
  "mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 text-left outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]";

type MaxLoginFormProps = {
  email: string;
  password: string;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

export default function MaxLoginForm({
  email,
  password,
  submitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: MaxLoginFormProps) {
  const isFormReady = email.trim().length > 0 && password.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !isFormReady) {
      return;
    }
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 w-full max-w-sm space-y-5 text-left"
    >
      <label className="block">
        <span className="text-sm font-medium text-[#25135c]">
          Электронная почта
        </span>
        <input
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          required
          autoComplete="email"
          placeholder="name@example.com"
          className={fieldClassName}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#25135c]">Пароль</span>
        <PasswordInput
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          required
          autoComplete="current-password"
          placeholder="Введите пароль"
          className={fieldClassName}
        />
        <p className="mt-2 text-right text-sm">
          <a
            href={MAX_APEX_FORGOT_PASSWORD_HREF}
            className="font-medium text-[#7042c5]"
          >
            Забыли пароль?
          </a>
        </p>
      </label>

      <button
        type="submit"
        disabled={submitting || !isFormReady}
        className="primary-cta primary-cta--form"
      >
        {submitting ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
