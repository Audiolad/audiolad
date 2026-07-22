"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";

import {
  getTestUserResetPreflightAction,
  resetAllowlistedTestUserAction,
} from "@/app/admin/users/test-reset-actions";
import {
  TEST_USER_RESET_CONFIRMATION_PHRASE,
  TEST_USER_RESET_EMAIL,
} from "@/lib/admin/test-user-reset/constants";
import { clearAudioladLocalTestData } from "@/lib/admin/test-user-reset/clear-local-test-data";
import type {
  TestUserResetPreflight,
  TestUserResetResult,
} from "@/lib/admin/test-user-reset/types";
import { createClient } from "@/lib/supabase/client";

type TestUserResetPanelProps = {
  initialPreflight: TestUserResetPreflight;
};

function formatCount(value: number): string {
  return value.toLocaleString("ru-RU");
}

function PreflightList({ preflight }: { preflight: TestUserResetPreflight }) {
  const { counts } = preflight;

  return (
    <ul className="mt-4 space-y-2 text-sm text-[#4f4370]">
      <li>
        Auth user:{" "}
        {preflight.authUserFound
          ? `${preflight.authUserId} (${preflight.profileDisplayName ?? "без имени"})`
          : "не найден"}
      </li>
      <li>Практик в аудиотеке: {formatCount(counts.userPractices)}</li>
      <li>Прогресс прослушивания: {formatCount(counts.practiceAudioProgress)}</li>
      <li>
        Плейлисты / элементы: {formatCount(counts.playlists)} /{" "}
        {formatCount(counts.playlistItems)}
      </li>
      <li>
        Email contact / preferences / consents: {formatCount(counts.emailContacts)} /{" "}
        {formatCount(counts.emailPreferences)} / {formatCount(counts.emailConsents)}
      </li>
      <li>
        Analytics sessions / events: {formatCount(counts.analyticsSessions)} /{" "}
        {formatCount(counts.analyticsEvents)}
      </li>
      <li>
        Anonymous IDs:{" "}
        {preflight.anonymousIds.length > 0
          ? preflight.anonymousIds.join(", ")
          : "нет"}
      </li>
      <li>
        Orders / payments / refunds: {formatCount(counts.orders)} /{" "}
        {formatCount(counts.payments)} / {formatCount(counts.refundedOrders)}
      </li>
      <li>
        Personal materials: {formatCount(counts.personalMaterialsCreated)} created /{" "}
        {formatCount(counts.personalMaterialsClaimed)} claimed
      </li>
      <li>Author memberships: {formatCount(counts.authorMembers)}</li>
      <li>Author applications: {formatCount(counts.authorApplications)}</li>
      <li>Promotion campaigns: {formatCount(counts.promotionCampaigns)}</li>
    </ul>
  );
}

function ResetReport({ result }: { result: TestUserResetResult }) {
  const deleted = result.deletedCounts;

  return (
    <div className="mt-4 space-y-3 text-sm text-[#4f4370]">
      <p>
        Статус:{" "}
        <span className="font-semibold text-[#25135c]">{result.status}</span>
      </p>
      <p>Удалённый auth user id: {result.authUserId ?? "—"}</p>
      <ul className="space-y-1">
        <li>Email contacts: {formatCount(deleted.emailContacts)}</li>
        <li>Email consents: {formatCount(deleted.emailConsents)}</li>
        <li>Email preferences: {formatCount(deleted.emailPreferences)}</li>
        <li>Email outbox: {formatCount(deleted.emailOutbox)}</li>
        <li>Email delivery events: {formatCount(deleted.emailDeliveryEvents)}</li>
        <li>Analytics events: {formatCount(deleted.analyticsEvents)}</li>
        <li>Analytics sessions: {formatCount(deleted.analyticsSessions)}</li>
        <li>Auth user deleted: {deleted.authUserDeleted ? "да" : "нет"}</li>
        <li>Avatar removed: {deleted.avatarRemoved ? "да" : "нет"}</li>
      </ul>
      <p className="text-[#796ba0]">
        Не удалялось: {result.notDeleted.join(", ")}
      </p>
      <p className="rounded-[16px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-[#25135c]">
        {result.browserHint}
      </p>
    </div>
  );
}

export default function TestUserResetPanel({
  initialPreflight,
}: TestUserResetPanelProps) {
  const [preflight, setPreflight] = useState(initialPreflight);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [report, setReport] = useState<TestUserResetResult | null>(null);
  const [localClearMessage, setLocalClearMessage] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const submitLockRef = useRef(false);

  const phraseMatches = useMemo(
    () => confirmationPhrase.trim() === TEST_USER_RESET_CONFIRMATION_PHRASE,
    [confirmationPhrase],
  );

  const refreshPreflight = useCallback(() => {
    startRefresh(async () => {
      setFormError(null);
      const result = await getTestUserResetPreflightAction();

      if (!result.ok) {
        setFormError(result.error ?? "Не удалось обновить preflight.");
        return;
      }

      setPreflight(result.preflight);
    });
  }, []);

  const handleReset = useCallback(() => {
    if (submitLockRef.current || isSubmitting || isRefreshing) {
      return;
    }

    submitLockRef.current = true;

    startSubmit(async () => {
      try {
        setFormError(null);
        setReport(null);
        setLocalClearMessage(null);

        const result = await resetAllowlistedTestUserAction({
          confirmationPhrase,
        });

        setReport(result.result);

        if (!result.ok) {
          if (result.forbidden) {
            setFormError("Недостаточно прав.");
            return;
          }

          if (result.invalidConfirmation) {
            setFormError("Неверная фраза подтверждения.");
            return;
          }

          setFormError(result.result.message ?? "Не удалось выполнить сброс.");
          return;
        }

        if (result.result.status === "failed") {
          setFormError(result.result.message ?? "Сброс заблокирован.");
        }

        if (result.result.status === "partial") {
          setFormError(
            result.result.message ??
              "Операция завершилась частично. Проверьте отчёт и при необходимости повторите.",
          );
        }

        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (
          user?.email &&
          user.email.toLowerCase() === TEST_USER_RESET_EMAIL.toLowerCase()
        ) {
          await supabase.auth.signOut();
        }

        refreshPreflight();
      } finally {
        submitLockRef.current = false;
      }
    });
  }, [confirmationPhrase, isRefreshing, isSubmitting, refreshPreflight]);

  const handleClearLocal = useCallback(() => {
    const cleared = clearAudioladLocalTestData();
    setLocalClearMessage(
      cleared.length > 0
        ? `Очищено локальных ключей: ${cleared.length}.`
        : "Локальные тестовые ключи не найдены.",
    );
  }, []);

  const destructiveDisabled =
    !phraseMatches || !preflight.canReset || isSubmitting || isRefreshing;

  return (
    <section
      aria-labelledby="test-user-reset-heading"
      className="mt-10 rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="test-user-reset-heading"
            className="text-[20px] font-semibold text-[#8f3045]"
          >
            Сброс тестового пользователя
          </h3>
          <p className="mt-1 text-sm text-[#9a5063]">
            Зафиксированный адрес:{" "}
            <span className="font-semibold">{TEST_USER_RESET_EMAIL}</span>
          </p>
          <p className="mt-2 text-sm text-[#9a5063]">
            Отдельная операция только для владельца платформы. Обычное удаление
            пользователей не затрагивается.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full border border-[#ddcfef] bg-white px-4 text-sm font-medium text-[#7042c5] disabled:opacity-60"
          disabled={isSubmitting || isRefreshing}
          onClick={refreshPreflight}
        >
          {isRefreshing ? "Обновление…" : "Обновить preflight"}
        </button>
      </div>

      <PreflightList preflight={preflight} />

      {preflight.blockers.length > 0 ? (
        <div className="mt-4 rounded-[16px] border border-[#efc7cf] bg-white px-4 py-3">
          <p className="text-sm font-semibold text-[#8f3045]">
            Сброс заблокирован:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#8f3045]">
            {preflight.blockers.map((blocker) => (
              <li key={blocker.code}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <label className="block text-sm font-medium text-[#25135c]">
          Введите фразу подтверждения
          <input
            type="text"
            value={confirmationPhrase}
            onChange={(event) => setConfirmationPhrase(event.target.value)}
            placeholder={TEST_USER_RESET_CONFIRMATION_PHRASE}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-[18px] border border-[#efc7cf] bg-white px-4 py-3 text-sm"
          />
        </label>

        {formError ? (
          <p className="text-sm text-[#b34f63]" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full bg-[#b34f63] px-5 text-sm font-medium text-white disabled:opacity-60"
            disabled={destructiveDisabled}
            onClick={handleReset}
          >
            {isSubmitting
              ? "Сброс…"
              : "Удалить и подготовить к новой регистрации"}
          </button>

          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full border border-[#ddcfef] bg-white px-5 text-sm font-medium text-[#7042c5]"
            onClick={handleClearLocal}
          >
            Очистить локальные тестовые данные
          </button>
        </div>

        {localClearMessage ? (
          <p className="text-sm text-[#796ba0]">{localClearMessage}</p>
        ) : null}
      </div>

      {report ? (
        <div className="mt-6 rounded-[18px] border border-[#eadff8] bg-white p-4">
          <h4 className="text-base font-semibold text-[#25135c]">
            Отчёт операции
          </h4>
          <ResetReport result={report} />
        </div>
      ) : null}
    </section>
  );
}
