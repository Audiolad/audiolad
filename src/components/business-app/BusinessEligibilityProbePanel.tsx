"use client";

import { useCallback, useState } from "react";

import { resolveBusinessAirplayEligibilityProbe } from "@/app/business-app/actions";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import {
  formatEligibilityDecisionLabel,
  venueAirplayEmptyStateCopy,
  type BusinessEligibilityProbeRow,
} from "@/lib/business-app/eligibility";
import {
  BUSINESS_RIGHTS_PROBE_FOOTNOTE,
  formatEligibilityDecisionCode,
  formatOwnerEligibilityDecisionExplanation,
} from "@/lib/business-app/rights-status-copy";

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
      <section className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <h2 className="text-lg font-bold">Статус прав на эфир</h2>
        <p className="mt-2 text-sm opacity-80">
          Войдите как владелец, чтобы увидеть статус прав для кандидатов эфира.
          Без точки проверка недоступна.
        </p>
      </section>
    );
  }

  const empty =
    probe.status === "idle"
      ? {
          title: compact ? "Пул эфира" : "Проверка статуса прав",
          description:
            "Нажмите «Проверить», чтобы обновить статус. В эфир — только подтверждённая пригодность; «уточняется» ≠ разрешение на эфир.",
        }
      : venueAirplayEmptyStateCopy({
          hasLocation: Boolean(domain.location),
          probed: probe.status === "ready",
          eligibleCount: probe.status === "ready" ? probe.eligibleCount : 0,
        });

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-60">
            Статус прав · только чтение
          </p>
          <h2 className="text-lg font-bold">
            {compact && probe.status !== "idle" ? "Пул эфира" : empty.title}
          </h2>
          <p className="mt-1 text-sm opacity-80">{empty.description}</p>
          <p className="mt-1 text-xs opacity-50">{BUSINESS_RIGHTS_PROBE_FOOTNOTE}</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-white/20 px-3 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
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
          className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-100"
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
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{row.label}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    row.decision === "ELIGIBLE"
                      ? "bg-emerald-500/30 text-emerald-100"
                      : row.decision === "INELIGIBLE"
                        ? "bg-red-500/30 text-red-100"
                        : "bg-amber-400/20 text-amber-100"
                  }`}
                  title={formatEligibilityDecisionCode(row.decision)}
                >
                  {formatEligibilityDecisionLabel(row.decision)}
                </span>
              </div>
              <p className="mt-1 text-xs opacity-70">
                {formatOwnerEligibilityDecisionExplanation(row.decision)}
                {" "}
                · код <code>{formatEligibilityDecisionCode(row.decision)}</code>
              </p>
              <p className="mt-1 break-all text-xs opacity-60">
                audio_item: <code>{row.audioItemId}</code>
                {row.trackCode ? (
                  <>
                    {" "}
                    · track <code>{row.trackCode}</code>
                  </>
                ) : null}
              </p>
              {row.reasonCodes.length > 0 ? (
                <p className="mt-1 text-xs opacity-70">
                  reasons: {row.reasonCodes.join(", ")}
                </p>
              ) : null}
              {row.error ? (
                <p className="mt-1 text-xs text-red-200">error: {row.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {probe.status === "loading" ? (
        <p className="text-sm opacity-70">Обновляем статус прав…</p>
      ) : null}
    </section>
  );
}
