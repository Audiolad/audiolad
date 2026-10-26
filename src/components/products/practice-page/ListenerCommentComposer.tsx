"use client";

import type { FormEvent } from "react";

import {
  LISTENER_IMPRESSION_NAME_LABEL,
  LISTENER_IMPRESSION_PLACEHOLDER,
  LISTENER_IMPRESSION_SAVING,
  LISTENER_IMPRESSION_SIGN_IN,
  LISTENER_IMPRESSION_SUBMIT,
} from "@/lib/practice-comments/copy";
import type { ListenerCommentComposerMode } from "@/lib/practice-comments/composer";

const fieldClass =
  "mt-2 w-full rounded-[16px] border border-[#e4d7f4] bg-white px-3 py-3 text-base text-[#2b2144] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold";

export default function ListenerCommentComposer({
  mode,
  publicName,
  body,
  pending,
  formError,
  signInHref,
  errorMessage,
  onPublicNameChange,
  onBodyChange,
  onSubmit,
}: {
  mode: ListenerCommentComposerMode;
  publicName: string;
  body: string;
  pending: boolean;
  formError: string | null;
  signInHref: string;
  errorMessage: string | null;
  onPublicNameChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  if (mode === "sign_in") {
    return (
      <p className="mt-4 text-sm leading-6 text-[#6d628c]" data-listener-comment-composer="sign_in">
        {LISTENER_IMPRESSION_SIGN_IN}{" "}
        <a className="font-semibold text-[#7042c5] underline" href={signInHref}>
          Войти
        </a>
      </p>
    );
  }

  return (
    <form
      className="mt-4"
      data-listener-comment-composer="form"
      onSubmit={onSubmit}
    >
      <label className="block text-sm font-medium text-[#2b2144]" htmlFor="listener-impression-name">
        {LISTENER_IMPRESSION_NAME_LABEL}
        <input
          id="listener-impression-name"
          className={fieldClass}
          value={publicName}
          maxLength={40}
          onChange={(event) => onPublicNameChange(event.target.value)}
          autoComplete="nickname"
        />
      </label>
      <label className="mt-3 block text-sm font-medium text-[#2b2144]" htmlFor="listener-impression-body">
        Ваше впечатление
        <textarea
          id="listener-impression-body"
          className={`${fieldClass} min-h-28`}
          value={body}
          maxLength={2000}
          placeholder={LISTENER_IMPRESSION_PLACEHOLDER}
          onChange={(event) => onBodyChange(event.target.value)}
        />
      </label>
      {formError ? (
        <p className="mt-2 text-sm text-[#9a3d55]" role="alert">
          {formError === "unauthorized" ? (
            <>
              Войдите, чтобы оставить отзыв.{" "}
              <a className="font-semibold underline" href={signInHref}>
                Войти
              </a>
            </>
          ) : (
            errorMessage
          )}
        </p>
      ) : null}
      <button
        type="submit"
        className={`${buttonClass} mt-3 bg-[#7042c5] text-white disabled:opacity-60`}
        disabled={pending || body.trim().length < 2}
      >
        {pending ? LISTENER_IMPRESSION_SAVING : LISTENER_IMPRESSION_SUBMIT}
      </button>
    </form>
  );
}
