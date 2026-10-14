"use client";

import Link from "next/link";
import { useMemo } from "react";

import BusinessDomainBootstrapForm from "@/components/business-app/BusinessDomainBootstrapForm";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import {
  buildBusinessGreeting,
  buildBusinessGreetingSubtitle,
} from "@/lib/business-app/greeting";
import type { BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";

import {
  buildBusinessHomeStatusCopy,
  formatBusinessAge,
} from "@/lib/business-app/owner-home-status-copy";

function StatusBanner({
  locationName,
  signals,
}: {
  locationName: string;
  signals: BusinessOwnerHomeSignals | null;
}) {
  const hb = buildBusinessHomeStatusCopy(signals);
  return (
    <section
      className="business-app-card business-app-span-full"
      aria-live="polite"
      data-testid="owner-home-status"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]">
        Что известно о точке
      </p>
      <p className="mt-1 text-lg font-semibold text-[var(--biz-text)]">{locationName}</p>
      <h2 className="mt-2 text-[1.35rem] font-bold leading-tight text-[var(--biz-text)]">
        {hb.title}
      </h2>
      <p className="mt-1 text-[1.02rem] text-[var(--biz-text-muted)]">{hb.detail}</p>
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

function InfoRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[var(--biz-border)] bg-white px-3.5 py-3">
      <p className="font-semibold text-[var(--biz-text)]">{title}</p>
      <p className="mt-0.5 text-sm text-[var(--biz-text-muted)]">{detail}</p>
    </div>
  );
}

export default function BusinessHomePage() {
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

      <div className="business-app-home-grid">
        <StatusBanner locationName={locationName || "Точка"} signals={signals} />

        <div className="business-app-home-stack">
          <section className="business-app-card" aria-labelledby="playback-data-title">
            <h2
              id="playback-data-title"
              className="text-[1.15rem] font-bold text-[var(--biz-text)]"
            >
              Данные о воспроизведении
            </h2>
            <p className="mt-3 text-[1.02rem] text-[var(--biz-text)]">
              {lastPlayAge
                ? `Последнее зарегистрированное событие воспроизведения: ${lastPlayAge}.`
                : "Событий воспроизведения пока нет или они недоступны."}
            </p>
            <p className="mt-1 text-sm text-[var(--biz-text-muted)]">
              Что звучит прямо сейчас, кабинет не знает. Управление музыкой — в
              плеере на устройстве точки.
            </p>
          </section>
        </div>

        <div className="business-app-home-stack">
          <section className="business-app-card" aria-labelledby="facts-title">
            <h2
              id="facts-title"
              className="text-[1.15rem] font-bold text-[var(--biz-text)]"
            >
              Сведения
            </h2>
            <div className="mt-4 grid gap-2.5">
              <InfoRow
                title="Лицензия: нет подтверждённых данных"
                detail="Кабинет пока не проверяет документы и права использования."
              />
              <InfoRow
                title="Интернет точки кабинетом не проверяется"
                detail="Доступен только возраст последнего сигнала от плеера."
              />
              <InfoRow
                title="Расписание и атмосфера — позже"
                detail="Эти функции ещё не подключены."
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
