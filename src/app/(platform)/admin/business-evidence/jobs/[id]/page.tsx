import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateMatchReportButton, JobAutoRefresh } from "@/components/admin/BusinessEvidenceJobActions";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { BUSINESS_EVIDENCE_HREF, JOB_STATE_TEXT } from "@/lib/evidence/constants";
import { loadJobView } from "@/lib/evidence/match-report.server";
import { formatLocal } from "@/lib/evidence/play-log";

export const dynamic = "force-dynamic";

const CARD = "rounded-[22px] border border-[#e7def6] bg-white p-5";
const OUTLINE_SM = "inline-flex min-h-8 items-center justify-center rounded-full border border-[#d9cdef] bg-white px-3 text-xs font-medium text-[#25135c]";
const CONF: Record<string, string> = { high: "высокая", medium: "средняя", low: "низкая" };

function mmss(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function fileHref(id: string, file: string) {
  return `/api/admin/business-evidence/job?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`;
}

/** «Сверка записей» → one checked recording (t1578u). Owner only. */
export default async function AdminBusinessEvidenceJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformOwnerAccess(`${BUSINESS_EVIDENCE_HREF}/jobs/${id}`);
  const view = await loadJobView(id).catch(() => null);
  if (!view) notFound();
  const { job, result, conc, concError, titles, reportSha256, reportPdf } = view;
  const running = job.state === "queued" || job.state === "waiting" || job.state === "running";
  const tz = conc?.location.timezone ?? "Europe/Moscow";
  const s = result?.summary;
  const catalogSegs = result?.segments.filter((x) => x.kind === "catalog") ?? [];

  return (
    <section aria-labelledby="admin-evidence-job-heading" className="space-y-5" data-testid="admin-evidence-job">
      <JobAutoRefresh active={running} />
      <div>
        <Link href={BUSINESS_EVIDENCE_HREF} className="text-sm text-[#796ba0] underline">← Сверка записей</Link>
        <h2 id="admin-evidence-job-heading" className="mt-2 text-[21px] font-semibold">Проверка записи «{job.input.name}»</h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          {formatLocal(job.createdAtUtc, "Europe/Moscow")} МСК · {JOB_STATE_TEXT[job.state] ?? job.state}
          {job.note ? ` · ${job.note}` : ""}
        </p>
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-[#25135c]">Файл</h3>
        <p className="mt-1 text-sm">{job.input.name} · {(job.input.size / 1024 / 1024).toFixed(1)} МБ{result ? ` · ${mmss(result.input.decoded_duration_s)}` : ""}</p>
        {job.input.sha256 ? <p className="mt-1 break-all font-mono text-[11px] text-[#796ba0]">SHA-256: {job.input.sha256}</p> : null}
        {result?.input.probe?.tags && Object.keys(result.input.probe.tags).length ? (
          <p className="mt-1 text-xs text-[#796ba0]">
            Метаданные: {Object.entries(result.input.probe.tags).map(([k, v]) => `${k}=${v}`).join(", ")}
          </p>
        ) : null}
      </div>

      {running ? <div className={CARD}><p className="text-sm">Идёт проверка в фоне. Страница обновится сама.</p></div> : null}
      {job.state === "failed" ? <div className={CARD}><p className="text-sm text-[#b34f63]">{job.error === "RecordingTooLong" ? "Запись длиннее 2 часов – разрежьте её на части и проверьте по отдельности." : `Проверка не удалась${job.error ? ` (${job.error})` : ""}.`}</p></div> : null}

      {result && s ? (
        <div className={CARD} data-testid="admin-evidence-verdict">
          <h3 className="text-base font-semibold text-[#25135c]">Вывод</h3>
          {s.catalog_tracks.length ? (
            <p className="mt-2 text-sm">
              В записи распознана музыка каталога АудиоЛад: {s.catalog_tracks.map((c) => (titles[c] ? `${c} «${titles[c]}»` : c)).join(", ")}.
            </p>
          ) : (
            <p className="mt-2 text-sm">Совпадений с каталогом АудиоЛад не найдено.</p>
          )}
          <p className="mt-1 text-xs text-[#796ba0]">
            Фрагментов по 10 с: {s.windows} · каталог {s.catalog_windows} · контрольная чужая музыка {s.control_windows} · без совпадения {s.unmatched_windows}
            {s.conflict_windows ? ` · противоречивых ${s.conflict_windows}` : ""}
          </p>
          {result.claimed_refs.map((r) => (
            <p key={r.code} className="mt-2 text-sm">
              Трек из претензии «{r.title}»: {s.claimed_windows ? `звучит в записи (фрагментов: ${s.claimed_windows})` : "в записи не обнаружен"}.
            </p>
          ))}
        </div>
      ) : null}

      {result && result.segments.length ? (
        <div className={CARD}>
          <h3 className="text-base font-semibold text-[#25135c]">Совпадения по времени записи</h3>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-[#796ba0]">
              <tr><th className="py-1">Запись</th><th>Трек</th><th>Позиция в треке</th><th>Надёжность</th></tr>
            </thead>
            <tbody>
              {result.segments.map((g, i) => (
                <tr key={i} className="border-t border-[#efe8fa]">
                  <td className="py-1">{mmss(g.rec_from_s)}–{mmss(g.rec_to_s)}</td>
                  <td>
                    {g.code}
                    {g.kind === "control" ? " (контроль, чужая музыка)" : g.kind === "claimed" ? ` (трек из претензии «${result.claimed_refs.find((x) => x.code === g.code)?.title ?? "–"}»)` : titles[g.code] ? ` «${titles[g.code]}»` : ""}
                  </td>
                  <td>{mmss(g.track_from_s)}–{mmss(g.track_to_s)}</td>
                  <td>{CONF[g.confidence] ?? g.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {result ? (
        <div className={CARD} data-testid="admin-evidence-concordance">
          <h3 className="text-base font-semibold text-[#25135c]">Сверка с журналом воспроизведения</h3>
          {concError ? (
            <p className="mt-2 text-sm text-[#b34f63]">Не удалось прочитать журнал точки.</p>
          ) : !conc ? (
            <p className="mt-2 text-sm text-[#796ba0]">Не выполнялась: не указаны точка и время записи, а в файле нет даты записи.</p>
          ) : (
            <>
              <p className="mt-2 text-sm">{conc.location.organizationName} – {conc.location.name}</p>
              <p className="mt-1 text-sm">
                Заявленное время записи: {conc.claimedStartUtc ? formatLocal(conc.claimedStartUtc, tz) : "–"}{" "}
                ({conc.claimedSource === "typed" ? "по акту" : "из метаданных файла"})
              </p>
              {conc.result.recordingStartUtc ? (
                <p className="mt-1 text-sm">
                  Начало записи по журналу: {formatLocal(conc.result.recordingStartUtc, tz)}, отличие {conc.result.claimedDeltaS} с. Подтверждено
                  журналом {conc.result.confirmedSegments} из {conc.result.catalogSegments} фрагментов каталога. Порядок треков:{" "}
                  {conc.result.orderConsistent === null ? "не проверялся" : conc.result.orderConsistent ? "совпадает" : "не совпадает"}.
                </p>
              ) : catalogSegs.length ? (
                <p className="mt-1 text-sm">В журнале точки за ±3 ч нет воспроизведений распознанных треков.</p>
              ) : (
                <p className="mt-1 text-sm">Нечего сверять: треков каталога в записи нет.</p>
              )}
              <p className="mt-1 text-xs text-[#796ba0]">Отметок журнала прочитано: {conc.facts}. Время – {tz}.</p>
              {conc.result.checks.length ? (
                <table className="mt-3 w-full text-left text-sm">
                  <thead className="text-xs text-[#796ba0]">
                    <tr><th className="py-1">Запись</th><th>Трек</th><th>Звучал</th><th>Плеер</th><th>В журнале</th></tr>
                  </thead>
                  <tbody>
                    {conc.result.checks.map((c, i) => (
                      <tr key={i} className="border-t border-[#efe8fa]">
                        <td className="py-1">{mmss(c.recFromS)}–{mmss(c.recToS)}</td>
                        <td>{c.code}</td>
                        <td>{c.heardFromUtc ? `${formatLocal(c.heardFromUtc, tz).slice(11)} – ${formatLocal(c.heardToUtc ?? c.heardFromUtc, tz).slice(11)}` : "–"}</td>
                        <td>{c.playerCode ?? ""}</td>
                        <td>{c.confirmed ? `да (±${Math.abs(c.deltaS ?? 0)} с)` : "нет"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {result ? (
        <div className={CARD}>
          <h3 className="text-base font-semibold text-[#25135c]">Отчёт сверки</h3>
          <p className="mt-1 text-sm text-[#796ba0]">PDF и report.json с хешами записи, индекса и результата, заверенные технической печатью сервиса.</p>
          <div className="mt-3"><CreateMatchReportButton jobId={job.id} hasReport={!!reportSha256} /></div>
          {reportSha256 ? (
            <>
              <p className="mt-3 break-all font-mono text-[11px] text-[#796ba0]">SHA-256 report.json: {reportSha256}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {reportPdf ? <a className={OUTLINE_SM} href={fileHref(job.id, "report.pdf")}>PDF</a> : null}
                <a className={OUTLINE_SM} href={fileHref(job.id, "report.json")}>report.json</a>
                <a className={OUTLINE_SM} href={fileHref(job.id, "report.sig")}>Печать</a>
                <a className={OUTLINE_SM} href={fileHref(job.id, "seal-public.pem")}>Ключ печати</a>
                <a className={OUTLINE_SM} href={fileHref(job.id, "result.json")}>Подробный результат</a>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
