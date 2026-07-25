"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { CommercialOnboardingStepState } from "@/lib/author-dashboard/commercial-onboarding";
import {
  type AuthorOnboardingChecklistState,
  type AuthorOnboardingStepState,
  type AuthorOnboardingUiPreference,
} from "@/lib/author-dashboard/onboarding-checklist";
import {
  getAuthorOnboardingUiPreference,
  getAuthorOnboardingUiPreferenceServerSnapshot,
  subscribeAuthorOnboardingUiPreference,
  writeAuthorOnboardingUiPreference,
} from "@/lib/author-dashboard/onboarding-preference-store";
import { buildAuthorPublicPath } from "@/lib/products/paths";

type AuthorOnboardingChecklistProps = {
  authorId: string;
  authorSlug: string;
  newProductHref: string;
};

function useAuthorOnboardingUiPreference(authorId: string) {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeAuthorOnboardingUiPreference(authorId, onStoreChange),
    [authorId],
  );
  const getSnapshot = useCallback(
    () => getAuthorOnboardingUiPreference(authorId),
    [authorId],
  );

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getAuthorOnboardingUiPreferenceServerSnapshot,
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M4.5 10.5 8 14l7.5-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d="M6.5 9V6.8a3.5 3.5 0 0 1 7 0V9M5.5 9h9v7.5h-9V9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProgressBar({
  completedCount,
  totalCount,
  label,
}: {
  completedCount: number;
  totalCount: number;
  label: string;
}) {
  const percent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div
      className="mt-3 h-2 overflow-hidden rounded-full bg-[#ece4f8]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={totalCount}
      aria-valuenow={completedCount}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-[#7042c5] transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "muted" | "soon" | "status" | "active";
}) {
  const className =
    tone === "soon"
      ? "border-[#ddd6eb] bg-[#f3f0f8] text-[#6f648f]"
      : tone === "status"
        ? "border-[#d7c9ef] bg-[#f4effc] text-[#5b3f9a]"
        : tone === "active"
          ? "border-[#c6afe6] bg-[#f7f2ff] text-[#7042c5]"
          : "border-[#ddd6eb] bg-[#f1eef6] text-[#7a7196]";

  return (
    <span
      className={`inline-flex max-w-full shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${className}`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function FreeStepCard({ step }: { step: AuthorOnboardingStepState }) {
  if (step.completed) {
    return (
      <li className="rounded-[18px] border border-[#d9efdf] bg-[#f7fcf8] px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3d8d65] text-white"
            aria-hidden="true"
          >
            <CheckIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-[15px] font-semibold text-[#2f6b4d]">
              {step.title}
            </p>
            <p className="sr-only">Шаг выполнен</p>
          </div>
        </div>
      </li>
    );
  }

  const emphasis = step.active
    ? "border-[#c6afe6] bg-white shadow-[0_8px_22px_rgba(91,62,145,0.08)]"
    : "border-[#eadff8] bg-[#fbf8ff]";

  return (
    <li className={`rounded-[20px] border px-4 py-4 ${emphasis}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            step.active
              ? "bg-[#7042c5] text-white"
              : "bg-[#e8def7] text-[#7042c5]"
          }`}
          aria-hidden="true"
        >
          •
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p
            className={`break-words text-[15px] font-semibold ${
              step.active ? "text-[#2f2548]" : "text-[#5f5484]"
            }`}
          >
            {step.title}
          </p>
          <p
            className={`mt-1 break-words text-sm leading-6 ${
              step.active ? "text-[#5f5484]" : "text-[#8a7fad]"
            }`}
          >
            {step.description}
          </p>

          {step.hint ? (
            <p className="mt-2 break-words rounded-[14px] border border-[#f0e2b8] bg-[#fff9ea] px-3 py-2 text-sm text-[#8a6a1d]">
              {step.hint}
            </p>
          ) : null}

          {step.id === "prepare_product" && step.readiness ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-[#7d70a2]">
                Готовность: {step.readiness.completedCount} из{" "}
                {step.readiness.totalCount}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {step.readiness.requirements.map((item) => (
                  <li
                    key={item.key}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      item.ok
                        ? "bg-[#eaf7ef] text-[#3d8d65]"
                        : "bg-[#f2eef8] text-[#7d70a2]"
                    }`}
                  >
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4">
            <Link
              href={step.ctaHref}
              target={step.ctaExternal ? "_blank" : undefined}
              rel={step.ctaExternal ? "noopener noreferrer" : undefined}
              className="inline-flex w-full items-center justify-center rounded-full bg-[#7042c5] px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:w-auto"
            >
              {step.ctaLabel}
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

function CommercialStepCard({ step }: { step: CommercialOnboardingStepState }) {
  if (step.state === "completed") {
    return (
      <li className="rounded-[18px] border border-[#d9efdf] bg-[#f7fcf8] px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3d8d65] text-white"
            aria-hidden="true"
          >
            <CheckIcon />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex flex-wrap items-start gap-2">
              <p className="min-w-0 flex-1 break-words text-[15px] font-semibold text-[#2f6b4d]">
                {step.title}
              </p>
              {step.statusLabel ? (
                <StatusBadge label={step.statusLabel} tone="status" />
              ) : null}
            </div>
            <p className="sr-only">Шаг выполнен</p>
          </div>
        </div>
      </li>
    );
  }

  if (step.state === "locked" || step.state === "coming_soon") {
    const isComingSoon = step.state === "coming_soon";

    return (
      <li className="cursor-default rounded-[20px] border border-[#e2ddec] bg-[#f5f3f8] px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e4dfec] text-[#8a829f]"
            aria-hidden="true"
          >
            <LockIcon />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex flex-wrap items-start gap-2">
              <p className="min-w-0 flex-1 break-words text-[15px] font-semibold text-[#6f6788]">
                {step.title}
              </p>
              <StatusBadge
                label={
                  step.statusLabel ??
                  (isComingSoon ? "Скоро будет доступно" : "Пока недоступно")
                }
                tone={isComingSoon ? "soon" : "muted"}
              />
            </div>
            <p className="mt-1 break-words text-sm leading-6 text-[#8a829f]">
              {step.description}
            </p>
            {step.hint ? (
              <p className="mt-2 break-words text-sm leading-6 text-[#7d7596]">
                {step.hint}
              </p>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-[20px] border border-[#c6afe6] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(91,62,145,0.08)]">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-xs font-semibold text-white"
          aria-hidden="true"
        >
          •
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex flex-wrap items-start gap-2">
            <p className="min-w-0 flex-1 break-words text-[15px] font-semibold text-[#2f2548]">
              {step.title}
            </p>
            {step.statusLabel ? (
              <StatusBadge label={step.statusLabel} tone="active" />
            ) : null}
          </div>
          <p className="mt-1 break-words text-sm leading-6 text-[#5f5484]">
            {step.description}
          </p>

          {step.hint ? (
            <p className="mt-2 break-words rounded-[14px] border border-[#f0e2b8] bg-[#fff9ea] px-3 py-2 text-sm text-[#8a6a1d]">
              {step.hint}
            </p>
          ) : null}

          {step.id === "prepare_paid_product" && step.readiness ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-[#7d70a2]">
                Готовность: {step.readiness.completedCount} из{" "}
                {step.readiness.totalCount}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {step.readiness.requirements.map((item) => (
                  <li
                    key={item.key}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      item.ok
                        ? "bg-[#eaf7ef] text-[#3d8d65]"
                        : "bg-[#f2eef8] text-[#7d70a2]"
                    }`}
                  >
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step.actionLabel && step.href ? (
            <div className="mt-4">
              <Link
                href={step.href}
                target={step.ctaExternal ? "_blank" : undefined}
                rel={step.ctaExternal ? "noopener noreferrer" : undefined}
                className="inline-flex w-full min-w-[10rem] items-center justify-center rounded-full bg-[#7042c5] px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:w-auto"
              >
                {step.actionLabel}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function AuthorOnboardingChecklist({
  authorId,
  authorSlug,
  newProductHref,
}: AuthorOnboardingChecklistProps) {
  const preference = useAuthorOnboardingUiPreference(authorId);
  const [checklist, setChecklist] =
    useState<AuthorOnboardingChecklistState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadChecklist() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/author/onboarding?author_id=${encodeURIComponent(authorId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          checklist?: AuthorOnboardingChecklistState;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }

        if (!cancelled) {
          setChecklist(payload.checklist ?? null);
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить стартовый чек-лист.");
          setChecklist(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadChecklist();

    return () => {
      cancelled = true;
    };
  }, [authorId]);

  function updatePreference(next: Partial<AuthorOnboardingUiPreference>) {
    writeAuthorOnboardingUiPreference(authorId, {
      collapsed: next.collapsed ?? preference.collapsed,
      dismissed: next.dismissed ?? preference.dismissed,
    });
  }

  if (loading) {
    return (
      <div className="mt-6 rounded-[24px] border border-[#eadff8] bg-white px-5 py-4 text-sm text-[#7d70a2]">
        Загрузка стартового чек-листа…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-[24px] border border-[#f2c7c7] bg-[#fff5f5] px-5 py-4 text-sm text-[#9b3d3d]">
        {error}
      </div>
    );
  }

  if (!checklist) {
    return null;
  }

  const journeyComplete = checklist.journeyComplete === true;

  if (journeyComplete && preference.dismissed) {
    return (
      <div className="mt-6">
        <button
          type="button"
          onClick={() => updatePreference({ dismissed: false, collapsed: false })}
          className="text-sm font-semibold text-[#7042c5] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Показать стартовый чек-лист
        </button>
      </div>
    );
  }

  if (journeyComplete) {
    return (
      <section
        className="mt-6 rounded-[24px] border border-[#d9efdf] bg-[#f7fcf8] px-5 py-5"
        aria-labelledby="author-onboarding-success-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#3d8d65]">
              🎉 Поздравляем!
            </p>
            <h2
              id="author-onboarding-success-title"
              className="mt-1 break-words text-[18px] font-semibold text-[#2f6b4d]"
            >
              Ваша страница автора полностью готова.
            </h2>
            <p className="mt-2 break-words text-sm leading-6 text-[#4f7a61]">
              Теперь ваши материалы могут находить новых слушателей через
              АудиоЛад.
            </p>
          </div>
          <button
            type="button"
            onClick={() => updatePreference({ dismissed: true })}
            className="rounded-full border border-[#b9dcc6] px-3 py-1.5 text-xs font-semibold text-[#2f6b4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d8d65]"
          >
            Скрыть
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link
            href={buildAuthorPublicPath(authorSlug)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-full bg-[#3d8d65] px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d8d65] sm:w-auto"
          >
            Открыть страницу автора
          </Link>
          <Link
            href={newProductHref}
            className="inline-flex w-full items-center justify-center rounded-full border border-[#b9dcc6] px-4 py-2.5 text-sm font-semibold text-[#2f6b4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d8d65] sm:w-auto"
          >
            Создать ещё один продукт
          </Link>
        </div>
      </section>
    );
  }

  const freeProgressLabel = `Бесплатный старт – пройдено ${checklist.completedCount} из ${checklist.totalCount} шагов`;
  const commercialProgressLabel =
    checklist.commercial.progressMode === "gated"
      ? "Откроется после публикации бесплатного продукта"
      : `Коммерческий кабинет – пройдено ${checklist.commercial.completedCount} из ${checklist.commercial.totalCount} шагов`;

  return (
    <section
      className="mt-6 overflow-hidden rounded-[24px] border border-[#eadff8] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(91,62,145,0.06)]"
      aria-labelledby="author-onboarding-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id="author-onboarding-title"
            className="break-words text-[20px] font-semibold text-[#2f2548]"
          >
            Начните работу на АудиоЛаде
          </h2>
          <p className="mt-2 break-words text-sm leading-6 text-[#5f5484]">
            Подготовьте страницу автора и опубликуйте первый аудиопродукт. Мы
            покажем каждый следующий шаг.
          </p>
        </div>
        <button
          type="button"
          onClick={() => updatePreference({ collapsed: !preference.collapsed })}
          aria-expanded={!preference.collapsed}
          className="rounded-full border border-[#d9c9ef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {preference.collapsed ? "Развернуть" : "Свернуть"}
        </button>
      </div>

      {!preference.collapsed ? (
        <div className="mt-6 space-y-8">
          <section aria-labelledby="author-onboarding-free-title">
            <h3
              id="author-onboarding-free-title"
              className="text-[16px] font-semibold text-[#2f2548]"
            >
              Бесплатный старт
            </h3>
            <p className="mt-2 break-words text-sm font-medium text-[#5f5484]">
              {freeProgressLabel}
            </p>
            <ProgressBar
              completedCount={checklist.completedCount}
              totalCount={checklist.totalCount}
              label={freeProgressLabel}
            />
            <ol className="mt-5 space-y-3">
              {checklist.steps.map((step) => (
                <FreeStepCard key={step.id} step={step} />
              ))}
            </ol>
          </section>

          <section aria-labelledby="author-onboarding-commercial-title">
            <h3
              id="author-onboarding-commercial-title"
              className="text-[16px] font-semibold text-[#2f2548]"
            >
              Начните зарабатывать на своих аудиопродуктах
            </h3>
            {!checklist.commercial.unlocked ? (
              <p className="mt-2 break-words text-sm leading-6 text-[#5f5484]">
                Коммерческие возможности станут доступны после публикации
                первого бесплатного продукта.
              </p>
            ) : null}
            <p className="mt-2 break-words text-sm font-medium text-[#5f5484]">
              {commercialProgressLabel}
            </p>
            {checklist.commercial.progressMode === "count" ? (
              <ProgressBar
                completedCount={checklist.commercial.completedCount}
                totalCount={checklist.commercial.totalCount}
                label={commercialProgressLabel}
              />
            ) : null}
            <ol className="mt-5 space-y-3">
              {checklist.commercial.steps.map((step) => (
                <CommercialStepCard key={step.id} step={step} />
              ))}
            </ol>
          </section>
        </div>
      ) : (
        <p className="mt-4 break-words text-sm text-[#7d70a2]">
          Чек-лист свёрнут. Разверните, чтобы увидеть следующий шаг.
        </p>
      )}
    </section>
  );
}
