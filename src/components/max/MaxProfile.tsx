"use client";

import { useRef, useState } from "react";

import { MAX_TAB_BAR_HEIGHT_PX } from "@/lib/max/primary-tabs";
import {
  MAX_SHELL_LOGIN_CTA,
  MAX_SHELL_SIGNUP_CTA,
} from "@/lib/max/session-shell";

export const MAX_PROFILE_TITLE = "Профиль";
export const MAX_PROFILE_LINKED_STATUS = "Аккаунт АудиоЛада подключён к MAX";
export const MAX_PROFILE_LOGOUT_LABEL = "Выйти из аккаунта";
export const MAX_PROFILE_LOGOUT_HELP =
  "После выхода аккаунт АудиоЛада будет отключён от этого профиля MAX. Чтобы войти снова, потребуется авторизация.";
export const MAX_PROFILE_CONFIRM_TITLE = "Выйти из аккаунта?";
export const MAX_PROFILE_CONFIRM_BODY =
  "Связь между этим MAX и аккаунтом АудиоЛада будет удалена.";
export const MAX_PROFILE_CANCEL_LABEL = "Отмена";
export const MAX_PROFILE_CONFIRM_LABEL = "Выйти";
export const MAX_PROFILE_LOGOUT_ERROR =
  "Не удалось выйти. Попробуйте ещё раз.";
export const MAX_PROFILE_GUEST_STATUS = "Вы используете АудиоЛад без входа";
export const MAX_PROFILE_LOGIN_LABEL = MAX_SHELL_LOGIN_CTA;
export const MAX_PROFILE_SIGNUP_LABEL = MAX_SHELL_SIGNUP_CTA;

export function MaxGuestProfile({
  onLogin,
  onSignup,
}: {
  onLogin?: () => void;
  onSignup?: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mt-5 text-[26px] font-semibold leading-tight text-[#25135c]">
        {MAX_PROFILE_TITLE}
      </h1>
      <section className="mt-5 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
        <p className="text-sm leading-5 text-[#4a3d73]">{MAX_PROFILE_GUEST_STATUS}</p>
      </section>
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={onLogin}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {MAX_PROFILE_LOGIN_LABEL}
        </button>
        <button
          type="button"
          onClick={onSignup}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#7042c5] px-5 py-3 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {MAX_PROFILE_SIGNUP_LABEL}
        </button>
      </div>
    </div>
  );
}

type MaxProfileProps = {
  /**
   * Already-known AudioLad display name. This screen does not fetch it.
   * Omit when no safe value is already in hand.
   */
  displayName?: string | null;
  /**
   * Already-known account email from an existing safe server path.
   * Omit when that path has not already supplied it.
   */
  email?: string | null;
  submitting?: boolean;
  onLogout: () => Promise<boolean>;
};

function visibleAccountLine(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return null;
  }
  return trimmed;
}

export default function MaxProfile({
  displayName,
  email,
  submitting = false,
  onLogout,
}: MaxProfileProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoutPending = useRef(false);
  const name = visibleAccountLine(displayName);
  const accountEmail = visibleAccountLine(email);

  async function confirmLogout() {
    if (submitting || logoutPending.current) {
      return;
    }
    logoutPending.current = true;
    setError(null);
    try {
      const ok = await onLogout();
      if (!ok) {
        logoutPending.current = false;
        setError(MAX_PROFILE_LOGOUT_ERROR);
      }
    } catch {
      logoutPending.current = false;
      setError(MAX_PROFILE_LOGOUT_ERROR);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mt-5 text-[26px] font-semibold leading-tight text-[#25135c]">
        {MAX_PROFILE_TITLE}
      </h1>
      <section className="mt-5 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
        {name ? (
          <p className="text-[17px] font-semibold leading-6 text-[#25135c]">
            {name}
          </p>
        ) : null}
        {accountEmail ? (
          <p className="mt-1 text-sm leading-5 text-[#6c5d94]">{accountEmail}</p>
        ) : null}
        <p
          className={`text-sm leading-5 text-[#4a3d73] ${name || accountEmail ? "mt-2" : ""}`}
        >
          {MAX_PROFILE_LINKED_STATUS}
        </p>
      </section>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        disabled={submitting}
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
      >
        {MAX_PROFILE_LOGOUT_LABEL}
      </button>
      <p className="mt-3 text-sm leading-5 text-[#6c5d94]">
        {MAX_PROFILE_LOGOUT_HELP}
      </p>
      {confirming ? (
        <div
          className="fixed inset-x-0 top-0 z-30 flex items-end justify-center bg-[#25135c]/40 px-4 pb-4"
          style={{
            bottom: `calc(${MAX_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="max-profile-logout-title"
            className="w-full max-w-lg rounded-[20px] border border-[#eadff8] bg-white px-4 py-5"
          >
            <h2
              id="max-profile-logout-title"
              className="text-[20px] font-semibold leading-tight text-[#25135c]"
            >
              {MAX_PROFILE_CONFIRM_TITLE}
            </h2>
            <p className="mt-2 text-sm leading-5 text-[#4a3d73]">
              {MAX_PROFILE_CONFIRM_BODY}
            </p>
            {error ? (
              <p className="mt-3 text-sm leading-5 text-[#b34f63]">{error}</p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  setError(null);
                  setConfirming(false);
                }}
                disabled={submitting}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[#7042c5] px-4 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
              >
                {MAX_PROFILE_CANCEL_LABEL}
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmLogout();
                }}
                disabled={submitting}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#7042c5] px-4 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
              >
                {MAX_PROFILE_CONFIRM_LABEL}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
