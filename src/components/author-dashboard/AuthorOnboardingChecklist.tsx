"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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

function ProgressBar({
  completedCount,
  totalCount,
}: {
  completedCount: number;
  totalCount: number;
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
      aria-label={`Пройдено ${completedCount} из ${totalCount} шагов`}
    >
      <div
        className="h-full rounded-full bg-[#7042c5] transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function StepCard({ step }: { step: AuthorOnboardingStepState }) {
  if (step.completed) {
    return (
      <li className="rounded-[18px] border border-[#d9efdf] bg-[#f7fcf8] px-4 py-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3d8d65] text-white"
            aria-hidden="true"
          >
            <CheckIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[#2f6b4d]">
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
      <div className="flex items-start gap-3">
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
        <div className="min-w-0 flex-1">
          <p
            className={`text-[15px] font-semibold ${
              step.active ? "text-[#2f2548]" : "text-[#5f5484]"
            }`}
          >
            {step.title}
          </p>
          <p
            className={`mt-1 text-sm leading-6 ${
              step.active ? "text-[#5f5484]" : "text-[#8a7fad]"
            }`}
          >
            {step.description}
          </p>

          {step.hint ? (
            <p className="mt-2 rounded-[14px] border border-[#f0e2b8] bg-[#fff9ea] px-3 py-2 text-sm text-[#8a6a1d]">
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

  if (checklist.complete && preference.dismissed) {
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

  if (checklist.complete) {
    return (
      <section
        className="mt-6 rounded-[24px] border border-[#d9efdf] bg-[#f7fcf8] px-5 py-5"
        aria-labelledby="author-onboarding-success-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#3d8d65]">
              🎉 Поздравляем!
            </p>
            <h2
              id="author-onboarding-success-title"
              className="mt-1 text-[18px] font-semibold text-[#2f6b4d]"
            >
              Ваша страница автора полностью готова.
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#4f7a61]">
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

  return (
    <section
      className="mt-6 rounded-[24px] border border-[#eadff8] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(91,62,145,0.06)]"
      aria-labelledby="author-onboarding-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id="author-onboarding-title"
            className="text-[20px] font-semibold text-[#2f2548]"
          >
            Начните работу на АудиоЛаде
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#5f5484]">
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

      <p className="mt-4 text-sm font-medium text-[#5f5484]">
        Пройдено {checklist.completedCount} из {checklist.totalCount} шагов
      </p>
      <ProgressBar
        completedCount={checklist.completedCount}
        totalCount={checklist.totalCount}
      />

      {!preference.collapsed ? (
        <ol className="mt-5 space-y-3">
          {checklist.steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-[#7d70a2]">
          Чек-лист свёрнут. Разверните, чтобы увидеть следующий шаг.
        </p>
      )}
    </section>
  );
}
