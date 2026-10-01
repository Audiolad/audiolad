import Link from "next/link";

import type { BusinessSupportDiagnostics } from "@/lib/business-app/support-diagnostics";
import {
  formatHeartbeatAgeRu,
  healthStatusLabelRu,
} from "@/lib/business-app/support-diagnostics";

function overallBanner(overall: BusinessSupportDiagnostics["overall"]) {
  if (overall === "ok") {
    return {
      className: "business-app-status-banner is-healthy",
      title: "Диагностика: без критичных сбоев",
      emoji: "🟢",
    };
  }
  if (overall === "warn") {
    return {
      className: "business-app-status-banner is-autonomous",
      title: "Диагностика: есть предупреждения",
      emoji: "🟡",
    };
  }
  return {
    className: "business-app-status-banner is-stopped",
    title: "Диагностика: нужна проверка",
    emoji: "🔴",
  };
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-all text-[0.98rem] text-[var(--biz-text)] ${
          mono ? "font-mono text-[0.9rem]" : "font-medium"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function BusinessSupportDiagnosticPage({
  diagnostics,
}: {
  diagnostics: BusinessSupportDiagnostics;
}) {
  const banner = overallBanner(diagnostics.overall);
  const location = diagnostics.location;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="business-app-span-full">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]">
          Поддержка
        </p>
        <h1 className="mt-1 text-[1.55rem] font-bold tracking-tight text-[var(--biz-text)]">
          Диагностика точки
        </h1>
        <p className="mt-2 text-[1rem] leading-relaxed text-[var(--biz-text-muted)]">
          Сводка для поддержки до звонка клиенту: локация, плеер, heartbeat,
          последний play и коды проблем. Только чтение; без прав и каталога.
        </p>
      </header>

      <section
        className={`${banner.className} business-app-span-full`}
        aria-live="polite"
      >
        <h2 className="text-[1.25rem] font-bold leading-tight">
          <span aria-hidden="true">{banner.emoji} </span>
          {banner.title}
        </h2>
        <p className="mt-1 text-[0.98rem]">
          Источник: A1 domain + A2 player health + business Proof of Play.
        </p>
      </section>

      <section className="business-app-card" aria-labelledby="support-org-loc">
        <h2
          id="support-org-loc"
          className="text-[1.1rem] font-bold text-[var(--biz-text)]"
        >
          Организация и точка
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Организация"
            value={diagnostics.organizationName ?? "—"}
          />
          <Field
            label="Organization ID"
            value={diagnostics.organizationId ?? "—"}
            mono
          />
          <Field label="Точка" value={location?.name ?? "—"} />
          <Field label="Location ID" value={location?.id ?? "—"} mono />
          <Field label="Страна" value={location?.countryCode ?? "—"} />
          <Field label="Часовой пояс" value={location?.timezone ?? "—"} />
          <Field label="Статус точки" value={location?.status ?? "—"} />
          <Field
            label="Default Zone ID"
            value={location?.defaultZoneId ?? "—"}
            mono
          />
        </dl>
      </section>

      <section className="business-app-card" aria-labelledby="support-players">
        <h2
          id="support-players"
          className="text-[1.1rem] font-bold text-[var(--biz-text)]"
        >
          Плееры и heartbeat
        </h2>
        {diagnostics.players.length === 0 ? (
          <p className="mt-3 text-[0.98rem] text-[var(--biz-text-muted)]">
            Плееров нет. Откройте{" "}
            <Link href="/player" className="font-semibold text-[var(--biz-accent)]">
              /player
            </Link>{" "}
            после создания устройства.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {diagnostics.players.map((player) => (
              <li
                key={player.playerId}
                className="rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3.5 py-3"
              >
                <p className="font-semibold text-[var(--biz-text)]">
                  {player.displayName?.trim() || player.playerCode}
                  <span className="ml-2 text-sm font-medium text-[var(--biz-text-muted)]">
                    {healthStatusLabelRu(player.healthStatus)}
                  </span>
                </p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Player code" value={player.playerCode} mono />
                  <Field label="Player ID" value={player.playerId} mono />
                  <Field label="Статус записи" value={player.playerStatus} />
                  <Field
                    label="Health"
                    value={player.healthStatus}
                    mono
                  />
                  <Field
                    label="Heartbeat"
                    value={
                      player.lastHeartbeatAt
                        ? `${player.lastHeartbeatAt} (${formatHeartbeatAgeRu(player.secondsSinceHeartbeat)})`
                        : "нет"
                    }
                  />
                  <Field
                    label="Zone ID"
                    value={player.zoneId ?? "не назначен"}
                    mono
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="business-app-card" aria-labelledby="support-last-play">
        <h2
          id="support-last-play"
          className="text-[1.1rem] font-bold text-[var(--biz-text)]"
        >
          Последний business play
        </h2>
        {diagnostics.lastPlay ? (
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="occurred_at" value={diagnostics.lastPlay.occurredAt} mono />
            <Field
              label="Возраст"
              value={
                diagnostics.lastPlay.minutesAgo != null
                  ? `${diagnostics.lastPlay.minutesAgo} мин назад`
                  : "—"
              }
            />
            <Field
              label="audio_item_id"
              value={diagnostics.lastPlay.audioItemId ?? "—"}
              mono
            />
            <Field
              label="player_id"
              value={diagnostics.lastPlay.playerId ?? "—"}
              mono
            />
          </dl>
        ) : (
          <p className="mt-3 text-[0.98rem] text-[var(--biz-text-muted)]">
            Записей usage_kind=business пока нет.
          </p>
        )}
      </section>

      <section className="business-app-card" aria-labelledby="support-issues">
        <h2
          id="support-issues"
          className="text-[1.1rem] font-bold text-[var(--biz-text)]"
        >
          Коды проблем
        </h2>
        {diagnostics.issues.length === 0 ? (
          <p className="mt-3 text-[0.98rem] text-[var(--biz-green)]">
            Критичных кодов нет.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {diagnostics.issues.map((issue) => (
              <li
                key={`${issue.code}:${issue.messageRu}`}
                className={`rounded-xl border px-3 py-2.5 text-[0.95rem] ${
                  issue.severity === "error"
                    ? "border-[#f0c0c0] bg-[var(--biz-red-bg)]"
                    : issue.severity === "warn"
                      ? "border-[#f0e0a8] bg-[var(--biz-yellow-bg)]"
                      : "border-[var(--biz-border)] bg-[var(--biz-surface-soft)]"
                }`}
              >
                <p className="font-mono text-xs font-semibold uppercase tracking-wide opacity-80">
                  {issue.code} · {issue.severity}
                </p>
                <p className="mt-1 font-medium">{issue.messageRu}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-[var(--biz-text-muted)]">
          Это не юридический статус и не каталог эфира. Для плеера:{" "}
          <Link href="/player" className="font-semibold text-[var(--biz-accent)]">
            /player
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
