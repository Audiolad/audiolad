"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { openMaxExternalLink, readMaxInitData } from "@/lib/max/bridge";
import { MAX_PROFILE_PATH } from "@/lib/max/host";
import {
  maxAuthorDashboardUrl,
  maxProfileExternalUrl,
  readMaxProfilePayload,
  type MaxProfileDto,
} from "@/lib/max/profile";
import { MAX_TAB_BAR_HEIGHT_PX } from "@/lib/max/primary-tabs";
import {
  MAX_SHELL_LOGIN_CTA,
  MAX_SHELL_SIGNUP_CTA,
} from "@/lib/max/session-shell";
import { getProfileApplicationCopy } from "@/lib/profile/application-copy";
import {
  formatCounterDisplay,
  getAuthorMemberRoleLabel,
} from "@/lib/profile/display-name";

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
export const MAX_PROFILE_LOADING = "Загружаем профиль…";
export const MAX_PROFILE_LOAD_ERROR = "Не удалось загрузить профиль.";
export const MAX_PROFILE_RETRY_LABEL = "Повторить";
export const MAX_PROFILE_PLAYLISTS_LABEL = "Плейлисты";
export const MAX_PROFILE_AUTHOR_HEADING = "Для авторов";
export const MAX_PROFILE_AUTHOR_CABINET_LABEL = "Открыть кабинет автора";

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
  submitting?: boolean;
  onLogout: () => Promise<boolean>;
  onOpenPlaylists: () => void;
};

type MaxProfileScreenProps = MaxProfileProps & {
  status: "loading" | "error" | "ready";
  profile: MaxProfileDto | null;
  onRetry: () => void;
};

function MaxProfileAccountFooter({
  submitting = false,
  onLogout,
}: {
  submitting?: boolean;
  onLogout: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoutPending = useRef(false);

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
    <div>
      <p className="mt-6 text-sm leading-5 text-[#4a3d73]">
        {MAX_PROFILE_LINKED_STATUS}
      </p>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        disabled={submitting}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
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

function MaxProfileAuthorBlock({ profile }: { profile: MaxProfileDto }) {
  const section = profile.authorSection;
  if (section.kind === "member") {
    return (
      <section className="mt-6" aria-labelledby="max-profile-author-heading">
        <h2
          id="max-profile-author-heading"
          className="text-[21px] font-semibold text-[#25135c]"
        >
          {MAX_PROFILE_AUTHOR_HEADING}
        </h2>
        <div className="mt-3 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
          <ul className="space-y-3">
            {section.workspaces.slice(0, 2).map((workspace) => (
              <li key={workspace.slug}>
                <p className="text-[17px] font-semibold leading-6 text-[#25135c]">
                  {workspace.name}
                </p>
                <p className="mt-1 text-sm leading-5 text-[#6c5d94]">
                  {getAuthorMemberRoleLabel(workspace.role)}
                </p>
              </li>
            ))}
          </ul>
          {profile.card.authorWorkspaceCountLabel ? (
            <p className="mt-3 text-sm leading-5 text-[#6c5d94]">
              {profile.card.authorWorkspaceCountLabel}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              openMaxExternalLink(maxAuthorDashboardUrl(section.workspaces));
            }}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {MAX_PROFILE_AUTHOR_CABINET_LABEL}
          </button>
        </div>
      </section>
    );
  }

  const copy = getProfileApplicationCopy(section.variant);
  const externalUrl = copy.ctaHref ? maxProfileExternalUrl(copy.ctaHref) : null;

  return (
    <section className="mt-6" aria-labelledby="max-profile-author-heading">
      <h2
        id="max-profile-author-heading"
        className="text-[21px] font-semibold text-[#25135c]"
      >
        {copy.heading}
      </h2>
      <div className="mt-3 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
        <p className="text-sm leading-5 text-[#4a3d73]">{copy.description}</p>
        {section.reviewComment ? (
          <div className="mt-3 rounded-[16px] border border-[#eadff8] bg-[#faf6ff] px-3 py-3 text-sm leading-5 text-[#4a3d73]">
            <p className="font-medium text-[#7042c5]">Комментарий команды</p>
            <p className="mt-2">{section.reviewComment}</p>
          </div>
        ) : null}
        {copy.ctaLabel && externalUrl ? (
          <button
            type="button"
            onClick={() => {
              openMaxExternalLink(externalUrl);
            }}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {copy.ctaLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function MaxProfileScreen({
  status,
  profile,
  onRetry,
  onOpenPlaylists,
  submitting = false,
  onLogout,
}: MaxProfileScreenProps) {
  const ready = status === "ready" && profile ? profile : null;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mt-5 text-[26px] font-semibold leading-tight text-[#25135c]">
        {MAX_PROFILE_TITLE}
      </h1>
      {status === "loading" ? (
        <p className="mt-5 text-sm leading-5 text-[#6c5d94]" aria-live="polite">
          {MAX_PROFILE_LOADING}
        </p>
      ) : null}
      {status === "error" || (status === "ready" && !ready) ? (
        <div className="mt-5 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
          <p className="text-sm leading-5 text-[#4a3d73]">{MAX_PROFILE_LOAD_ERROR}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#7042c5] px-5 py-3 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {MAX_PROFILE_RETRY_LABEL}
          </button>
        </div>
      ) : null}
      {ready ? (
        <>
          <section className="mt-5 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-[#eadff8] bg-[#f7effe]"
                aria-hidden="true"
              >
                {ready.card.avatarUrl ? (
                  <Image
                    src={ready.card.avatarUrl}
                    alt=""
                    width={88}
                    height={88}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    data-max-profile-initial={ready.card.initial}
                    className="text-4xl text-[#7042c5]"
                  >
                    {ready.card.initial}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-[22px] font-semibold leading-tight text-[#25135c]">
                  {ready.card.displayName}
                </p>
                {ready.card.email ? (
                  <p className="mt-1 truncate text-sm leading-5 text-[#6c5d94]">
                    {ready.card.email}
                  </p>
                ) : null}
                <p className="mt-1 text-sm leading-5 text-[#4a3d73]">
                  {ready.card.rolePrimaryLabel}
                </p>
                {ready.card.authorWorkspaceCountLabel ? (
                  <p className="mt-1 text-xs leading-5 text-[#6c5d94]">
                    {ready.card.authorWorkspaceCountLabel}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
          <section className="mt-4 grid grid-cols-3 gap-3" aria-label="Сводка">
            {ready.counters.map((counter) => {
              const valueLabel = formatCounterDisplay(counter.value);
              return (
                <div
                  key={counter.key}
                  data-max-profile-counter={counter.key}
                  className="rounded-[18px] border border-[#eadff8] bg-white px-2 py-3 text-center"
                  aria-label={`${counter.label}: ${valueLabel}`}
                >
                  <p className="text-xl font-semibold text-[#7042c5]">{valueLabel}</p>
                  <p className="mt-1 text-xs leading-4 text-[#6c5d94]">{counter.label}</p>
                </div>
              );
            })}
          </section>
          <button
            type="button"
            onClick={onOpenPlaylists}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#7042c5] bg-white px-5 py-3 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {MAX_PROFILE_PLAYLISTS_LABEL}
          </button>
          <MaxProfileAuthorBlock profile={ready} />
        </>
      ) : null}
      <MaxProfileAccountFooter submitting={submitting} onLogout={onLogout} />
    </div>
  );
}

export default function MaxProfile({
  submitting = false,
  onLogout,
  onOpenPlaylists,
}: MaxProfileProps) {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [profile, setProfile] = useState<MaxProfileDto | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const initData = readMaxInitData();
      if (!initData) {
        // Yield first: this effect must not set state synchronously.
        await Promise.resolve();
        if (controller.signal.aborted) return;
        setProfile(null);
        setStatus("error");
        return;
      }

      try {
        const response = await fetch(MAX_PROFILE_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        const next = response.ok ? readMaxProfilePayload(payload) : null;
        if (!next) {
          setProfile(null);
          setStatus("error");
          return;
        }
        setProfile(next);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setProfile(null);
          setStatus("error");
        }
      }
    })();

    return () => controller.abort();
  }, [attempt]);

  return (
    <MaxProfileScreen
      status={status}
      profile={profile}
      onRetry={() => {
        setProfile(null);
        setStatus("loading");
        setAttempt((current) => current + 1);
      }}
      onOpenPlaylists={onOpenPlaylists}
      submitting={submitting}
      onLogout={onLogout}
    />
  );
}
