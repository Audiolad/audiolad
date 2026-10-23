"use client";

import Link from "next/link";

import { useCallback, useState } from "react";

import { resolveBusinessAirplayEligibilityProbe } from "@/app/business-app/actions";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import {
  formatEligibilityDecisionLabel,
  venueAirplayEmptyStateCopy,
  type BusinessEligibilityProbeRow,
} from "@/lib/business-app/eligibility";

type ProbeState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      rows: BusinessEligibilityProbeRow[];
      eligibleCount: number;
    }
  | { status: "error"; message: string };

export default function BusinessEligibilityProbePanel({
  compact = false,
}: {
  compact?: boolean;
}) {
  const domain = useBusinessDomain();
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });

  const runProbe = useCallback(async () => {
    if (domain.status !== "authenticated" || !domain.location) {
      setProbe({ status: "idle" });
      return;
    }
    setProbe({ status: "loading" });
    const result = await resolveBusinessAirplayEligibilityProbe({
      locationId: domain.location.id,
      zoneId: domain.location.defaultZoneId,
    });
    if (!result.ok) {
      setProbe({ status: "error", message: result.error });
      return;
    }
    setProbe({
      status: "ready",
      rows: result.rows,
      eligibleCount: result.eligibleCount,
    });
  }, [domain]);

  if (domain.status === "anonymous") {
    return (
      <section className="business-app-card">
        <h2 className="text-lg font-bold text-[var(--biz-text)]">Права на музыку</h2>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">
          <a href="https://audiolad.ru/auth/sign-in" className="underline">Войдите как владелец</a>, чтобы проверить права на музыку.
        </p>
      </section>
    );
  }

  const empty =
    probe.status === "idle"
      ? {
          title: compact
            ? "Музыка для заведения"
            : "Проверка прав",
          description:
            "Нажмите «Проверить», чтобы узнать, какие треки можно включать в заведении. Неподтверждённые треки в подборку не попадают.",
        }
      : venueAirplayEmptyStateCopy({
          hasLocation: Boolean(domain.location),
          probed: probe.status === "ready",
          eligibleCount: probe.status === "ready" ? probe.eligibleCount : 0,
        });

  return (
    <section className="business-app-card space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="business-app-eyebrow">
            Проверка прав на музыку
          </p>
          <h2 className="text-lg font-bold text-[var(--biz-text)]">
            {compact && probe.status !== "idle" ? "Музыка для заведения" : empty.title}
          </h2>
          <p className="mt-1 text-sm text-[var(--biz-text-muted)]">{empty.description}{!domain.location ? <> <Link href="/onboarding" className="underline">Подключить заведение</Link></> : null}</p>
          <p className="mt-1 text-xs text-[var(--biz-text-muted)]">
            Проверяем разрешение на воспроизведение. Отсутствие сведений не означает, что права подтверждены.</p>
        </div>
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          disabled={probe.status === "loading" || !domain.location}
          onClick={() => void runProbe()}
        >
          {probe.status === "loading"
            ? "Проверяем…"
            : probe.status === "idle"
              ? "Проверить"
              : "Обновить"}
        </button>
      </header>

      {probe.status === "error" ? (
        <p
          className="business-app-alert"
          data-tone="error"
          role="alert"
        >
          {probe.message}
        </p>
      ) : null}

      {probe.status === "ready" ? (
        <ul className="space-y-2">
          {probe.rows.map((row) => (
            <li
              key={row.audioItemId}
              className="business-app-list-row text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--biz-text)]">{row.label}</span>
                <span
                  className="business-app-badge"
                  data-tone={
                    row.decision === "ELIGIBLE"
                      ? "ok"
                      : row.decision === "INELIGIBLE"
                        ? "error"
                        : "warn"
                  }
                >
                  {formatEligibilityDecisionLabel(row.decision)}
                </span>
              </div>
              <p className="mt-1 break-all text-xs text-[var(--biz-text-muted)]">
                Запись: <code>{row.audioItemId}</code>
                {row.trackCode ? (
                  <>
                    {" "}
                     · Код трека: <code>{row.trackCode}</code>
                  </>
                ) : null}
              </p>
              {row.reasonCodes.length > 0 ? (
                <p className="mt-1 text-xs text-[var(--biz-text-muted)]">
                  Причины: права на воспроизведение не подтверждены.
                </p>
              ) : null}
              {row.error ? (
                <p className="mt-1 text-xs text-[var(--biz-red-ink)]">Ошибка: не удалось проверить права на трек.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {probe.status === "loading" ? (
        <p className="text-sm text-[var(--biz-text-muted)]">Проверяем права…</p>
      ) : null}
    </section>
  );
}
