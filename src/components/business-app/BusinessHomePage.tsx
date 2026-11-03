"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useBusinessHostname, useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { businessAuthHref } from "@/lib/access-grants/paths";

import BusinessHomeAccessCard from "@/components/business-app/BusinessHomeAccessCard";
import BusinessHomeChecklist from "@/components/business-app/BusinessHomeChecklist";
import { useBusinessEntry, usePointMode } from "@/components/business-app/BusinessPointMode";
import PointDeviceControls from "@/components/business-app/PointDeviceControls";
import { useOwnerHomeElapsed } from "@/components/business-app/useOwnerHomeElapsed";
import BusinessDomainBootstrapForm from "@/components/business-app/BusinessDomainBootstrapForm";
import { BUSINESS_GUEST_COFFEE_PUBLIC_PATH } from "@/lib/business-app/host";
import {
  buildBusinessGreeting,
  buildBusinessGreetingSubtitle,
} from "@/lib/business-app/greeting";
import { buildBusinessHomeSteps, businessHomeMusicDone } from "@/lib/business-app/home-checklist";
import {
  deriveOwnerPlaybackSignal,
  type OwnerPlaybackSignalInput,
  type BusinessOwnerHomeSignals,
} from "@/lib/business-app/owner-home-signals";

import {
  ageOwnerHomeSignals,
} from "@/lib/business-app/owner-home-live-refresh";
/**
 * The /spa player reports live state (part B). Its last-seen time is a connectivity
 * heartbeat too; use whichever heartbeat is fresher. Never implies sound.
 */
export function mergeLiveConnectivity(signals: BusinessOwnerHomeSignals | null): BusinessOwnerHomeSignals | null {
  if (!signals) return null;
  const live = signals.lastSeenSeconds;
  if (live == null || !Number.isFinite(live) || live < 0) return signals;
  const hb = signals.secondsSinceHeartbeat;
  if (hb != null && Number.isFinite(hb) && hb >= 0 && hb <= live) return signals;
  return {
    ...signals,
    playerCount: Math.max(1, signals.playerCount),
    primaryHealthStatus: live <= 300 ? "online" : "offline",
    secondsSinceHeartbeat: live,
  };
}

/** Red only for an error reported by a player that is still on the line. */
export function livePlaybackInput(signals: BusinessOwnerHomeSignals | null): OwnerPlaybackSignalInput {
  // "Now" is the server time the signals were loaded (no client clock in render).
  const confirmedMs = signals?.playbackConfirmedAt ? Date.parse(signals.playbackConfirmedAt) : NaN;
  const age = signals?.playbackConfirmedSecondsAgo;
  const nowMs = Number.isFinite(confirmedMs) && age != null && Number.isFinite(age) ? confirmedMs + age * 1000 : NaN;
  return {
    nowMs,
    playbackState: signals?.playbackState ?? null,
    playbackConfirmedAt: signals?.playbackConfirmedAt ?? null,
    errorConfirmed: signals?.playbackState === "error" && signals?.liveConnected === true,
  };
}

export type BusinessHomePageProps = {
  /** Part B only: no live server confirmation source is connected in Part A. */
  playbackConfirmation?: OwnerPlaybackSignalInput;
  /** A device in the hall is paired with the venue (server read); null when unknown. */
  pointLinked?: boolean | null;
};

/**
 * Главная (Sergey, 03.11.2026): a short «С чего начать» checklist. Each step sends the owner to
 * the tab that does it. Venue controls live only on «Настройка».
 */
export default function BusinessHomePage({ playbackConfirmation, pointLinked = null }: BusinessHomePageProps = {}) {
  const domain = useBusinessDomain();
  const hostname = useBusinessHostname();
  const pointMode = usePointMode();
  const { entry } = useBusinessEntry();
  const rawSignals =
    domain.status === "authenticated" ? domain.signals ?? null : null;
  const elapsedSeconds = useOwnerHomeElapsed(rawSignals);
  const signals = mergeLiveConnectivity(ageOwnerHomeSignals(rawSignals, elapsedSeconds));

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
      ? "Войдите, чтобы управлять кофейней."
      : domain.status === "authenticated" && !domain.location
        ? "Подключите своё заведение – это займёт минуту."
        : buildBusinessGreetingSubtitle();

  const playback = deriveOwnerPlaybackSignal(
    playbackConfirmation ?? livePlaybackInput(signals),
  );
  const steps = buildBusinessHomeSteps({
    musicDone: businessHomeMusicDone({ playback, lastPlayMinutesAgo: signals?.lastPlayMinutesAgo }),
    deviceLinked: pointLinked,
    pointMode,
  });

  if (domain.status === "anonymous") {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-5">
          <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]">
            Аудиолад Бизнес
          </h1>
          <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">
            Войдите в аккаунт, чтобы подключить кофейню и увидеть реальный статус.
          </p>
        </header>
        <section className="business-app-card max-w-xl">
          <p className="text-[1.05rem] text-[var(--biz-text)]">
            Здесь появится статус вашей кофейни: плеер, что звучит сейчас, документы. Пока вы в
            гостевом режиме – настройте звучание и послушайте подборки в разделе «Музыка».
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={BUSINESS_GUEST_COFFEE_PUBLIC_PATH}
              className="business-app-btn business-app-btn-primary business-app-focus-ring"
            >
              Настроить звучание
            </Link>
            <a
              href={businessAuthHref(hostname, "sign-in")}
              className="business-app-btn business-app-btn-secondary business-app-focus-ring"
            >
              Войти
            </a>
          </div>
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
        <BusinessHomeAccessCard />
        <section className="business-app-card max-w-xl" aria-labelledby="bootstrap-title">
          <h2 id="bootstrap-title" className="text-[1.25rem] font-bold text-[var(--biz-text)]">
            Первая кофейня
          </h2>
          <p className="mt-2 text-[var(--biz-text-muted)]">
            Ответьте на пару вопросов о заведении – мы подберём музыку и после вашего согласия подключим кофейню. Всё в одном кабинете.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 business-app-btn business-app-btn-primary business-app-focus-ring"
          >
            Начать подключение
          </Link>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--biz-text-muted)]">
              Быстрое подключение без вопросов
            </summary>
            <BusinessDomainBootstrapForm />
          </details>
        </section>
      </div>
    );
  }

  // Header switcher side: the venue screen is titled with the venue, so a switch is visible
  // at the top of the page and not only far below.
  const venueSide = pointMode || entry === "venue";
  const title = venueSide ? locationName || "Кофейня" : greeting;
  const lead = venueSide ? "Что сделать, чтобы музыка играла в зале." : subtitle;

  return (
    <div className="mx-auto max-w-3xl" data-testid="biz-home" data-entry={venueSide ? "venue" : "person"}>
      <header className="mb-5">
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]" data-testid="biz-home-title">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">
          {lead}
        </p>
      </header>
      <div className="business-app-owner-home space-y-4">
        <BusinessHomeChecklist steps={steps} showAccess={!venueSide} />
        {pointMode ? <PointDeviceControls /> : null}
      </div>
    </div>
  );
}
