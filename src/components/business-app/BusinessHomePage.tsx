"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import BusinessDomainBootstrapForm from "@/components/business-app/BusinessDomainBootstrapForm";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import {
  buildBusinessGreeting,
  buildBusinessGreetingSubtitle,
} from "@/lib/business-app/greeting";
import {
  deriveOwnerPlaybackSignal,
  type OwnerPlaybackSignal,
  type OwnerPlaybackSignalInput,
  type BusinessOwnerHomeSignals,
} from "@/lib/business-app/owner-home-signals";

import {
  buildBusinessHomeStatusCopy,
  formatBusinessAge,
} from "@/lib/business-app/owner-home-status-copy";

function StatusBanner({
  locationName,
  signals,
  playback,
}: {
  locationName: string;
  signals: BusinessOwnerHomeSignals | null;
  playback: OwnerPlaybackSignal;
}) {
  const hb = buildBusinessHomeStatusCopy(signals);
  const checkedAge = hb.kind !== "no_data"
    ? formatBusinessAge((signals?.secondsSinceHeartbeat ?? 0) / 60)
    : null;
  return (
    <section
      className="business-app-card"
      aria-live="polite"
      data-testid="owner-home-status"
    >
      <h2 className="text-[1.35rem] font-bold leading-tight text-[var(--biz-text)]">
        {locationName}
      </h2>
      <p className="mt-1 text-sm text-[var(--biz-text-muted)]">
        {checkedAge ? `Последний сигнал от плеера: ${checkedAge}` : "Последний сигнал от плеера: нет данных"}
      </p>
      <ul className="business-app-owner-signals mt-4" aria-label="Сигналы точки">
        <li data-tone={hb.tone}>
          <strong>{hb.title}</strong>
          <p>{hb.detail}</p>
        </li>
        <li data-tone={playback.tone}>
          <strong>{playback.title}</strong>
          <p>{playback.detail}</p>
        </li>
      </ul>
      <p className="mt-4 text-sm text-[var(--biz-text-muted)]">
        Лицензия: нет подтверждённых данных
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="/player"
          className="business-app-btn business-app-btn-primary business-app-focus-ring"
        >
          Открыть плеер
        </a>
        <Link
          href="/help"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
        >
          Диагностика для поддержки
        </Link>
      </div>
    </section>
  );
}

function ComingSoon({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="business-app-card business-app-owner-disabled" role="group" aria-disabled="true">
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">{title} <span className="business-app-chip">скоро</span></h2>
      {children}
    </section>
  );
}

export type BusinessHomePageProps = {
  currentTrack?: { title: string; coverUrl?: string } | null;
  /** Part B only: no live server confirmation source is connected in Part A. */
  playbackConfirmation?: OwnerPlaybackSignalInput;
};

export default function BusinessHomePage({ currentTrack, playbackConfirmation }: BusinessHomePageProps = {}) {
  const domain = useBusinessDomain();
  const signals =
    domain.status === "authenticated" ? domain.signals ?? null : null;

  const ownerFirstName =
    domain.status === "authenticated" ? domain.owner.firstName : "гость";
  const locationName =
    domain.status === "authenticated" && domain.location
      ? domain.location.name
      : "";

  const greeting = useMemo(
    () => buildBusinessGreeting(ownerFirstName),
    [ownerFirstName],
  );
  const subtitle =
    domain.status === "anonymous"
      ? "Войдите, чтобы управлять точкой."
      : domain.status === "authenticated" && !domain.location
        ? "Создайте организацию и первую точку — это займёт минуту."
        : buildBusinessGreetingSubtitle();

  const playback = deriveOwnerPlaybackSignal(playbackConfirmation ?? { nowMs: 0 });
  const lastPlayAge = formatBusinessAge(signals?.lastPlayMinutesAgo ?? null);

  if (domain.status === "anonymous") {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-5">
          <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]">
            Аудиолад Бизнес
          </h1>
          <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">
            Войдите в аккаунт, чтобы подключить точку и увидеть реальный статус.
          </p>
        </header>
        <section className="business-app-card max-w-xl">
          <p className="text-[1.05rem] text-[var(--biz-text)]">
            Кабинет больше не использует демонстрационные данные «Марина / Beauty Line».
            Нужна сессия владельца.
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

  if (!domain.location) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-5">
          <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]">
            {greeting}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">
            {subtitle}
          </p>
        </header>
        <section className="business-app-card max-w-xl" aria-labelledby="bootstrap-title">
          <h2 id="bootstrap-title" className="text-[1.25rem] font-bold text-[var(--biz-text)]">
            Первая точка
          </h2>
          <p className="mt-2 text-[var(--biz-text-muted)]">
            Пройдите Zero-to-Music: тип → атмосфера → preview → подтверждение. Создадим
            Organization → Location → зону «по умолчанию» через production RPC
            <code className="mx-1 text-sm">create_business_organization_with_location</code>.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex rounded-xl bg-[var(--biz-accent)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Начать подключение
          </Link>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--biz-text-muted)]">
              Быстрая форма без мастера
            </summary>
            <BusinessDomainBootstrapForm />
          </details>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]">
          {greeting}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">
          {subtitle}
        </p>
      </header>

      <div className="business-app-home-grid business-app-owner-home">
        <div className="business-app-home-stack">
          <StatusBanner locationName={locationName || "Точка"} signals={signals} playback={playback} />
          <section className="business-app-card" aria-labelledby="playback-data-title">
            <h2 id="playback-data-title" className="text-[1.15rem] font-bold text-[var(--biz-text)]">
              Сейчас звучит
            </h2>
            {playback.kind === "confirmed" && currentTrack ? (
              <div className="mt-4 flex items-center gap-4">
                {currentTrack.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- optional real player artwork
                  <img src={currentTrack.coverUrl} alt={`Обложка «${currentTrack.title}»`} width={72} height={72} className="rounded-xl object-cover" />
                )}
                <p className="font-semibold text-[var(--biz-text)]">{currentTrack.title}</p>
              </div>
            ) : (
              <p className="mt-3 text-[var(--biz-text-muted)]">
                Что звучит сейчас — появится, когда плеер точки начнёт присылать подтверждения
              </p>
            )}
            {lastPlayAge && (
              <p className="mt-3 text-sm text-[var(--biz-text-muted)]">
                Последнее зарегистрированное событие воспроизведения: {lastPlayAge}.
              </p>
            )}
          </section>
        </div>
        <div className="business-app-home-stack">
          <ComingSoon title="Атмосфера">
            <p className="mt-3 text-[var(--biz-text-muted)]">Спокойнее — Энергичнее</p>
            <input type="range" min="0" max="100" disabled aria-disabled="true" aria-label="Атмосфера — скоро" className="mt-2 w-full min-h-12" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled aria-disabled="true" className="business-app-btn business-app-btn-secondary">Больше такого · скоро</button>
              <button type="button" disabled aria-disabled="true" className="business-app-btn business-app-btn-secondary">Меньше такого · скоро</button>
            </div>
          </ComingSoon>
          <ComingSoon title="Следующая смена музыкального дня">
            <p className="mt-3 text-[var(--biz-text-muted)]">Расписание точки пока не подключено.</p>
          </ComingSoon>
          <ComingSoon title="История звучания" />
        </div>
      </div>
    </div>
  );
}
