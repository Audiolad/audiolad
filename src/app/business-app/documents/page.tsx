import {
  CLIENT_DOCUMENT_EDITION_LABEL,
  CLIENT_DOCUMENT_REQUISITES,
  clientDocumentHref,
  CLIENT_DOCUMENTS,
  PLAYBACK_REPORT_DEFAULT_WINDOW_MINUTES,
  formatVenueTime,
  formatVenueZoneRu,
} from "@/lib/business-app/client-documents";
import { loadPlaybackReport } from "@/lib/business-app/load-playback-report";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function BusinessAppDocumentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const at = first(sp.at);
  const windowMinutes = first(sp.window);
  const result = await loadPlaybackReport({ at, windowMinutes });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="business-app-card" data-testid="client-documents">
        <h1 className="text-[1.45rem] font-bold tracking-tight text-[var(--biz-text)]">
          Документы
        </h1>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">
          Действующие документы «АудиоЛад Бизнес». Оператор сервиса:{" "}
          <span data-testid="client-documents-requisites">{CLIENT_DOCUMENT_REQUISITES}</span>.
        </p>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">
          Правообладатели треков указываются по данным реестра прав сервиса в отчёте «Что играло в заведении».
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {CLIENT_DOCUMENTS.map((doc) => (
            <li key={doc.id} data-doc-id={doc.id}>
              <a
                href={clientDocumentHref(doc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-[var(--biz-border)] p-3 hover:border-[var(--biz-accent)]"
                data-doc-link={doc.id}
              >
                <div className="font-semibold text-[var(--biz-text)] underline-offset-2 hover:underline">{doc.title}</div>
                <div className="mt-1 text-xs text-[var(--biz-text-muted)]">
                  <span className="font-semibold">{CLIENT_DOCUMENT_EDITION_LABEL}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--biz-text-muted)]">{doc.summary}</p>
                <span className="mt-1 inline-block text-sm font-semibold text-[var(--biz-accent)]">Открыть полный текст →</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--biz-text-muted)]">
          Получили претензию или пришла проверка? Ничего не подписывайте по
          существу и не платите на месте. Сообщите нам через раздел «Помощь»
          как можно раньше — сроки и исключения (обязательные по закону действия,
          поздно полученный иск, отсутствие нашего ответа) указаны в пп. 2.1–2.2
          «Порядка защиты клиента».
        </p>
      </section>

      <section className="business-app-card" data-testid="playback-report">
        <h2 className="text-[1.2rem] font-bold text-[var(--biz-text)]">
          Что играло в заведении в нужное время
        </h2>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">
          Отчёт строится по сообщениям плеера АудиоЛад о воспроизведении, которые принял
          сервер: сервер проверяет плеер и точку и фиксирует время получения, время начала
          и длительность сообщает плеер. Время — по часовому поясу точки.
        </p>
        {result.kind === "anonymous" ? (
          <p className="mt-3 text-sm">Войдите, чтобы построить отчёт.</p>
        ) : result.kind === "no_location" ? (
          <p className="mt-3 text-sm">Сначала добавьте точку.</p>
        ) : (
          <>
            <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-sm">
                Дата и время
                <input
                  type="datetime-local"
                  name="at"
                  defaultValue={at ?? ""}
                  required
                  className="rounded border px-2 py-1"
                />
              </label>
              <label className="flex flex-col text-sm">
                ± минут
                <input
                  type="number"
                  name="window"
                  min={1}
                  max={180}
                  defaultValue={windowMinutes ?? PLAYBACK_REPORT_DEFAULT_WINDOW_MINUTES}
                  className="w-24 rounded border px-2 py-1"
                />
              </label>
              <button type="submit" className="rounded bg-[var(--biz-accent)] px-3 py-1 font-semibold text-white">
                Показать
              </button>
            </form>
            {result.kind === "invalid_time" ? (
              <p className="mt-3 text-sm">Не удалось разобрать дату и время.</p>
            ) : null}
            {result.kind === "error" ? (
              <p className="mt-3 text-sm">Отчёт временно недоступен. Попробуйте позже.</p>
            ) : null}
            {result.kind === "ok" ? (
              <div className="mt-4">
                <p className="text-sm text-[var(--biz-text-muted)]">
                  {result.locationName} · {formatVenueZoneRu(result.report.fromUtc, result.report.timezone)} · интервал{" "}
                  {formatVenueTime(result.report.fromUtc, result.report.timezone)} —{" "}
                  {formatVenueTime(result.report.toUtc, result.report.timezone)}
                </p>
                {result.report.tracks.length === 0 ? (
                  <p className="mt-3 text-sm">
                    В этом интервале сервер не получал данных о воспроизведении в точке.
                  </p>
                ) : (
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th>Трек</th>
                        <th>С</th>
                        <th>По</th>
                        <th>В указанное время</th>
                        <th>Правообладатель по реестру прав</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.report.tracks.map((t, i) => (
                        <tr key={`${t.audioItemId}-${t.firstAt}-${i}`}>
                          <td>{t.title}</td>
                          <td>{formatVenueTime(t.firstAt, result.report.timezone)}</td>
                          <td>{formatVenueTime(t.lastAt, result.report.timezone)}</td>
                          <td>{t.coversT ? "да" : ""}</td>
                          <td>
                            {result.report.registryUnavailable
                              ? "сведения реестра временно недоступны"
                              : t.rightsholders.length > 0
                                ? t.rightsholders.join(", ")
                                : "нет записи в реестре"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="mt-3 text-xs text-[var(--biz-text-muted)]">
                  Отчёт подтверждает работу плеера АудиоЛад, но не доказывает, что
                  музыка была слышна в помещении и что в точке не звучала другая
                  музыка. Если связь прерывалась, часть воспроизведений может
                  отсутствовать. Отчёт не включает статус прав на момент
                  воспроизведения и не подписан электронной подписью. Для претензии
                  запросите у нас заверенную справку.
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
