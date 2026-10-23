import Link from "next/link";

import type { BusinessSupportDiagnostics } from "@/lib/business-app/support-diagnostics";
import { deriveOwnerConnectivitySignal, deriveOwnerPlaybackSignal } from "@/lib/business-app/owner-home-signals";
import { formatBusinessAge } from "@/lib/business-app/owner-home-status-copy";

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
  const playback = deriveOwnerPlaybackSignal({ nowMs: 0 });
  const location = diagnostics.location;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="business-app-span-full">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]">
          Поддержка
        </p>
        <h1 className="mt-1 text-[1.55rem] font-bold tracking-tight text-[var(--biz-text)]">
          Проверить работу музыки
        </h1>
        <p className="mt-2 text-[1rem] leading-relaxed text-[var(--biz-text-muted)]">
          Посмотрите, выходит ли плеер на связь и есть ли подтверждение воспроизведения.
          Здесь также показаны последнее событие воспроизведения и данные о лицензии.
        </p>
      </header>

      <section className="business-app-card" aria-labelledby="support-music-status">
        <h2 id="support-music-status" className="text-[1.1rem] font-bold text-[var(--biz-text)]">
          Состояние музыки
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Воспроизведение" value={playback.title} />
          <Field label="Лицензия" value="Нет подтверждённых данных" />
          <Field label="Количество плееров" value={String(diagnostics.players.length)} />
        </dl>
        <p className="mt-3 text-sm text-[var(--biz-text-muted)]">{playback.detail} <Link href="/player" className="underline">Открыть плеер</Link></p>
      </section>

      <section className="business-app-card" aria-labelledby="support-org-loc">
        <h2
          id="support-org-loc"
          className="text-[1.1rem] font-bold text-[var(--biz-text)]"
        >
          Заведение и точка
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Заведение"
            value={diagnostics.organizationName ?? "–"}
          />
          <Field
            label="Код заведения"
            value={diagnostics.organizationId ?? "–"}
            mono
          />
          <Field label="Точка" value={location?.name ?? "–"} />
          <Field label="Код точки" value={location?.id ?? "–"} mono />
          <Field label="Страна" value={location?.countryCode ?? "–"} />
          <Field label="Часовой пояс" value={location?.timezone ?? "–"} />
          <Field label="Статус точки" value={location?.status === "active" ? "Активна" : "Нет подтверждённых данных"} />
          <Field
            label="Основной зал"
            value={location?.defaultZoneId ?? "–"}
            mono
          />
        </dl>
      </section>

      <section className="business-app-card" aria-labelledby="support-players">
        <h2
          id="support-players"
          className="text-[1.1rem] font-bold text-[var(--biz-text)]"
        >
          Связь с плеерами
        </h2>
        {diagnostics.players.length === 0 ? (
          <p className="mt-3 text-[0.98rem] text-[var(--biz-text-muted)]">
            Нет данных о плеерах. Откройте{" "}
            <Link href="/player" className="font-semibold text-[var(--biz-accent)]">
              плеер
            </Link>{" "}
            точки, чтобы проверить подключение.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {diagnostics.players.map((player) => {
              const connectivity = deriveOwnerConnectivitySignal({
                playerCount: 1,
                primaryHealthStatus: player.healthStatus,
                secondsSinceHeartbeat: player.secondsSinceHeartbeat,
              });
              const signalAge = formatBusinessAge(
                player.secondsSinceHeartbeat == null ? null : player.secondsSinceHeartbeat / 60,
              );
              return (
                <li
                  key={player.playerId}
                  className="rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3.5 py-3"
                >
                  <p className="font-semibold text-[var(--biz-text)]">
                    {player.displayName?.trim() || player.playerCode}
                    <span className="ml-2 text-sm font-medium text-[var(--biz-text-muted)]">
                      {connectivity.title}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-[var(--biz-text-muted)]">{connectivity.detail}</p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="Код плеера" value={player.playerCode} mono />
                    <Field label="Код записи плеера" value={player.playerId} mono />
                    <Field label="Статус записи" value={player.playerStatus === "active" ? "Активна" : "Нет подтверждённых данных"} />
                    <Field
                      label="Связь"
                      value={connectivity.title}
                      mono
                    />
                    <Field
                      label="Последний сигнал от плеера"
                      value={signalAge ?? "нет данных"}
                    />
                    <Field label="Время последнего сигнала" value={player.lastHeartbeatAt ?? "нет данных"} />
                    <Field
                      label="Зал"
                      value={player.zoneId ?? "не назначен"}
                      mono
                    />
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="business-app-card" aria-labelledby="support-last-play">
        <h2
          id="support-last-play"
          className="text-[1.1rem] font-bold text-[var(--biz-text)]"
        >
          Последнее воспроизведение
        </h2>
        {diagnostics.lastPlay ? (
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Время события" value={diagnostics.lastPlay.occurredAt} mono />
            <Field
              label="Как давно"
              value={
                diagnostics.lastPlay.minutesAgo != null
                  ? formatBusinessAge(diagnostics.lastPlay.minutesAgo) ?? "нет данных"
                  : "–"
              }
            />
            <Field
              label="Код записи трека"
              value={diagnostics.lastPlay.audioItemId ?? "–"}
              mono
            />
            <Field
              label="Код записи плеера"
              value={diagnostics.lastPlay.playerId ?? "–"}
              mono
            />
          </dl>
        ) : (
          <p className="mt-3 text-[0.98rem] text-[var(--biz-text-muted)]">
            Нет данных о зарегистрированных событиях воспроизведения.
          </p>
        )}
      </section>

      <details className="business-app-card" aria-labelledby="support-issues">
        <summary className="business-app-focus-ring cursor-pointer">Сведения для поддержки</summary>
        <h2
          id="support-issues"
          className="text-[1.1rem] font-bold text-[var(--biz-text)]"
        >
          Что требует внимания
        </h2>
        {diagnostics.issues.length === 0 ? (
          <p className="mt-3 text-[0.98rem] text-[var(--biz-green)]">
            Проблем не обнаружено.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {diagnostics.issues.map((issue) => (
              <li
                key={`${issue.code}:${issue.messageRu}`}
                className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2.5 text-[0.95rem]"
              >
                <p className="font-mono text-xs font-semibold uppercase tracking-wide opacity-80">
                  {{ error: "Ошибка", warn: "Требует внимания", info: "Сведения" }[issue.severity]}
                </p>
                <p className="mt-1 font-medium">{issue.messageRu}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-[var(--biz-text-muted)]">
          Здесь показана работа плеера. Сведения о правах доступны в <Link href="/documents" className="underline">документах</Link>. {" "}
          <Link href="/player" className="font-semibold text-[var(--biz-accent)]">
            Открыть плеер
          </Link>
        </p>
      </details>
    </div>
  );
}
