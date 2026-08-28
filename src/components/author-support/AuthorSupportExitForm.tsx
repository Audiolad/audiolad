"use client";

import { useTransition } from "react";

import { stopAuthorSupportMode } from "@/lib/author-support/actions";

export const AUTHOR_SUPPORT_EXIT_LABEL = "Выйти из режима поддержки";
export const AUTHOR_SUPPORT_EXIT_PENDING_LABEL = "Выходим…";

type AuthorSupportExitFormProps = {
  variant?: "light" | "dark" | "inline";
};

export function AuthorSupportExitForm({
  variant = "light",
}: AuthorSupportExitFormProps) {
  const [isPending, startTransition] = useTransition();

  const className =
    variant === "dark"
      ? "inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white disabled:opacity-60"
      : variant === "inline"
        ? "inline-flex min-h-10 items-center justify-center rounded-full border border-[#d7c6f2] bg-white px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
        : "inline-flex min-h-10 items-center justify-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-60";

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          void stopAuthorSupportMode();
        });
      }}
      className={className}
    >
      {isPending ? AUTHOR_SUPPORT_EXIT_PENDING_LABEL : AUTHOR_SUPPORT_EXIT_LABEL}
    </button>
  );
}
