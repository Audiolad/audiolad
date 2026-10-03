"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { bootstrapBusinessOrganizationWithLocation } from "@/app/business-app/actions";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import {
  BUSINESS_ONBOARDING_ATMOSPHERES,
  BUSINESS_ONBOARDING_STEPS,
  BUSINESS_ONBOARDING_TYPES,
  buildBusinessOnboardingPreviewSummary,
  businessOnboardingStepIndex,
  canAdvanceBusinessOnboardingStep,
  getBusinessOnboardingType,
  nextBusinessOnboardingStep,
  prevBusinessOnboardingStep,
  suggestBusinessOnboardingNames,
  validateBusinessOnboardingConfirm,
  type BusinessOnboardingStep,
} from "@/lib/business-app/onboarding-wizard";

export default function BusinessOnboardingWizardPage() {
  const domain = useBusinessDomain();
  const router = useRouter();
  const [step, setStep] = useState<BusinessOnboardingStep>("type");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [atmosphereId, setAtmosphereId] = useState<string | null>(null);
  const suggested = useMemo(
    () => suggestBusinessOnboardingNames(typeId),
    [typeId],
  );
  const [organizationName, setOrganizationName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [namesTouched, setNamesTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<{
    organizationId: string;
    locationId: string;
    zoneId: string;
  } | null>(null);

  const preview = useMemo(
    () => buildBusinessOnboardingPreviewSummary({ typeId, atmosphereId }),
    [typeId, atmosphereId],
  );

  const stepNumber = businessOnboardingStepIndex(step);
  const totalInteractive = BUSINESS_ONBOARDING_STEPS.length - 1; // exclude done from progress feel

  if (domain.status === "anonymous") {
    return (
      <div className="mx-auto max-w-2xl">
        <WizardHeader
          title="Подключение точки"
          subtitle="Войдите, чтобы пройти Zero-to-Music: тип → атмосфера → preview → подтверждение."
        />
        <section className="business-app-card">
          <p className="text-[1.05rem] text-[var(--biz-text)]">
            Нужна сессия владельца. Демо-данные кабинета не используются.
          </p>
          <a
            href="https://audiolad.ru/auth/sign-in"
            className="mt-4 inline-flex rounded-xl bg-[var(--biz-accent)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Войти
          </a>
        </section>
      </div>
    );
  }

  if (domain.location && step !== "done") {
    return (
      <div className="mx-auto max-w-2xl">
        <WizardHeader
          title="Точка уже подключена"
          subtitle={`${domain.organizationName ?? "Организация"} · ${domain.location.name}`}
        />
        <section className="business-app-card space-y-3">
          <p className="text-[var(--biz-text-muted)]">
            Мастер первой точки уже пройден. Откройте плеер или статус на главной.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-xl bg-[var(--biz-accent)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              На главную
            </Link>
            <Link
              href="/player"
              className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--biz-text)]"
            >
              Открыть плеер
            </Link>
            <Link
              href="/music"
              className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--biz-text)]"
            >
              Музыка / eligibility
            </Link>
          </div>
        </section>
      </div>
    );
  }

  function goNext() {
    setError(null);
    if (!canAdvanceBusinessOnboardingStep(step, { typeId, atmosphereId })) {
      setError("Выберите вариант, чтобы продолжить.");
      return;
    }
    const next = nextBusinessOnboardingStep(step);
    if (next === "confirm" && !namesTouched) {
      setOrganizationName(suggested.organizationName);
      setLocationName(suggested.locationName);
    }
    if (next) setStep(next);
  }

  function goBack() {
    setError(null);
    const prev = prevBusinessOnboardingStep(step);
    if (prev) setStep(prev);
  }

  function onConfirm() {
    setError(null);
    const type = getBusinessOnboardingType(typeId);
    const validation = validateBusinessOnboardingConfirm({
      organizationName: organizationName || suggested.organizationName,
      locationName: locationName || suggested.locationName,
      businessCategory: type?.category ?? suggested.businessCategory,
      countryCode: "RU",
      timezone: "Europe/Moscow",
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    startTransition(async () => {
      const result = await bootstrapBusinessOrganizationWithLocation(
        validation.value,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated({
        organizationId: result.organizationId,
        locationId: result.locationId,
        zoneId: result.zoneId,
      });
      setStep("done");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <WizardHeader
        title="Zero-to-Music"
        subtitle="Тип → атмосфера → preview → подтвердить → плеер"
      />

      <div
        className="mb-4 flex items-center gap-2 text-sm text-[var(--biz-text-muted)]"
        aria-live="polite"
      >
        <span className="font-semibold text-[var(--biz-text)]">
          Шаг {Math.min(stepNumber, totalInteractive)} из {totalInteractive}
        </span>
        <span aria-hidden="true">·</span>
        <span>{stepLabel(step)}</span>
      </div>

      <section className="business-app-card space-y-4" aria-labelledby="wizard-step-title">
        {step === "type" ? (
          <>
            <h2 id="wizard-step-title" className="text-[1.25rem] font-bold">
              Что у вас?
            </h2>
            <p className="text-[var(--biz-text-muted)]">
              Выберите тип бизнеса — это станет категорией точки в A1 domain.
            </p>
            <ul className="space-y-2" role="listbox" aria-label="Тип бизнеса">
              {BUSINESS_ONBOARDING_TYPES.map((option) => {
                const selected = typeId === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => setTypeId(option.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-[var(--biz-accent)] bg-[var(--biz-accent-soft)]"
                          : "border-[var(--biz-border)] bg-[var(--biz-surface)] hover:bg-[var(--biz-surface-soft)]"
                      }`}
                    >
                      <span className="block text-[1.05rem] font-semibold text-[var(--biz-text)]">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-[var(--biz-text-muted)]">
                        {option.hint}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {step === "atmosphere" ? (
          <>
            <h2 id="wizard-step-title" className="text-[1.25rem] font-bold">
              Как должно ощущаться?
            </h2>
            <p className="text-[var(--biz-text-muted)]">
              Выбор атмосферы пока только для онбординга. Sonic DNA / dayparts —
              отдельный этап (P1-02), после Passport trust.
            </p>
            <ul className="space-y-2" role="listbox" aria-label="Атмосфера">
              {BUSINESS_ONBOARDING_ATMOSPHERES.map((option) => {
                const selected = atmosphereId === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => setAtmosphereId(option.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-[var(--biz-accent)] bg-[var(--biz-accent-soft)]"
                          : "border-[var(--biz-border)] bg-[var(--biz-surface)] hover:bg-[var(--biz-surface-soft)]"
                      }`}
                    >
                      <span className="block text-[1.05rem] font-semibold text-[var(--biz-text)]">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-[var(--biz-text-muted)]">
                        {option.vibe}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {step === "preview" ? (
          <>
            <h2 id="wizard-step-title" className="text-[1.25rem] font-bold">
              Послушайте (описательно)
            </h2>
            <div className="rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]">
                Черновик эфира
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--biz-text)]">
                {preview.typeLabel}
              </p>
              <p className="mt-1 text-[var(--biz-text)]">{preview.atmosphereLabel}</p>
              {preview.vibe ? (
                <p className="mt-2 text-[var(--biz-text-muted)]">{preview.vibe}</p>
              ) : null}
            </div>
            <p className="rounded-xl border border-[#f0e0a8] bg-[var(--biz-yellow-bg)] px-3 py-2 text-sm text-[var(--biz-text)]">
              {preview.noAudioNote}
            </p>
            <p className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-sm text-[var(--biz-text-muted)]">
              {preview.rightsSafeDisclaimer}
            </p>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <h2 id="wizard-step-title" className="text-[1.25rem] font-bold">
              Подтвердите точку
            </h2>
            <p className="text-[var(--biz-text-muted)]">
              Создадим Organization → Location → зону «по умолчанию» через{" "}
              <code className="text-sm">create_business_organization_with_location</code>.
            </p>
            <div className="space-y-3">
              <div>
                <label
                  className="block text-sm font-medium text-[var(--biz-text)]"
                  htmlFor="onboarding-org"
                >
                  Организация
                </label>
                <input
                  id="onboarding-org"
                  value={organizationName}
                  onChange={(e) => {
                    setNamesTouched(true);
                    setOrganizationName(e.target.value);
                  }}
                  maxLength={120}
                  className="mt-1 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-[var(--biz-text)]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-[var(--biz-text)]"
                  htmlFor="onboarding-loc"
                >
                  Точка
                </label>
                <input
                  id="onboarding-loc"
                  value={locationName}
                  onChange={(e) => {
                    setNamesTouched(true);
                    setLocationName(e.target.value);
                  }}
                  maxLength={120}
                  className="mt-1 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-[var(--biz-text)]"
                />
              </div>
              <p className="text-sm text-[var(--biz-text-muted)]">
                Категория:{" "}
                <strong className="text-[var(--biz-text)]">
                  {getBusinessOnboardingType(typeId)?.category ??
                    suggested.businessCategory}
                </strong>
                {" · "}
                RU · Europe/Moscow
              </p>
              <p className="text-sm text-[var(--biz-text-muted)]">
                Атмосфера «{preview.atmosphereLabel}» сохраняется как предпочтение
                онбординга (не DNA config).
              </p>
            </div>
          </>
        ) : null}

        {step === "done" ? (
          <>
            <h2 id="wizard-step-title" className="text-[1.25rem] font-bold">
              Точка создана
            </h2>
            <p className="text-[var(--biz-text)]">
              Дальше: откройте плеер и проверьте статус музыки. Каталог эфира
              пока пуст — статус прав уточняется (fail-closed).
            </p>
            {created ? (
              <p className="text-sm text-[var(--biz-text-muted)]">
                location <code className="text-xs">{created.locationId.slice(0, 8)}…</code>
                {" · "}
                zone <code className="text-xs">{created.zoneId.slice(0, 8)}…</code>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href="/player"
                className="rounded-xl bg-[var(--biz-accent)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Открыть плеер
              </Link>
              <Link
                href="/music"
                className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--biz-text)]"
              >
                Музыка / статус прав
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--biz-text)]"
              >
                На главную
              </Link>
            </div>
            <p className="text-sm text-[var(--biz-text-muted)]">
              {preview.rightsSafeDisclaimer}
            </p>
          </>
        ) : null}

        {error ? (
          <p className="text-sm font-medium text-[var(--biz-danger,#b42318)]" role="alert">
            {error}
          </p>
        ) : null}

        {step !== "done" ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {prevBusinessOnboardingStep(step) ? (
              <button
                type="button"
                onClick={goBack}
                disabled={pending}
                className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--biz-text)] disabled:opacity-60"
              >
                Назад
              </button>
            ) : null}
            {step === "confirm" ? (
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending}
                className="rounded-xl bg-[var(--biz-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Создаём…" : "Подтвердить и создать точку"}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={pending}
                className="rounded-xl bg-[var(--biz-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Далее
              </button>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function WizardHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="mb-5">
      <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]">
        {title}
      </h1>
      <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">
        {subtitle}
      </p>
    </header>
  );
}

function stepLabel(step: BusinessOnboardingStep): string {
  switch (step) {
    case "type":
      return "Тип бизнеса";
    case "atmosphere":
      return "Атмосфера";
    case "preview":
      return "Preview";
    case "confirm":
      return "Подтверждение";
    case "done":
      return "Готово";
    default:
      return step;
  }
}
