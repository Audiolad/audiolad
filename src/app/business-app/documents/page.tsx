import { headers } from "next/headers";
import Link from "next/link";

import { buildCoffeePublicPageMetadata } from "@/lib/business-app/seo";
import { getHostnameFromHeaders, isVenueLicencePublicId, venueLicencePublicUrl } from "@/lib/business-app/host";
import { businessAuthHref } from "@/lib/access-grants/paths";

import InspectorContactCard from "@/components/business-app/InspectorContactCard";
import ProfileHelpContact from "@/components/business-app/ProfileHelpContact";
import VenueLicenceStickerCard from "@/components/business-app/venue-licence/VenueLicenceStickerCard";

import {
  CLIENT_DOCUMENT_EDITION_LABEL,
  CLIENT_DOCUMENT_REQUISITES,
  clientDocumentHref,
  CLIENT_DOCUMENTS,
  PLAYBACK_REPORT_DEFAULT_WINDOW_MINUTES,
  formatVenueTime,
  formatVenueZoneRu,
} from "@/lib/business-app/client-documents";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { businessCabinetCan, type BusinessCabinetMode } from "@/lib/business-app/cabinet-mode";
import { loadBusinessCabinetMode } from "@/lib/business-app/cabinet-mode.server";
import { loadPlaybackReport, type PlaybackReportVenue } from "@/lib/business-app/load-playback-report";
import { loadPointDeviceVenue } from "@/lib/business-app/point-device.server";
import { isVenueLicencePublicEnabled } from "@/lib/business-app/venue-licence/flag";
import { loadOwnVenueSticker } from "@/lib/business-app/venue-licence/sticker-access.server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The venue's QR for the inspector card, and whether this page may offer the sticker download.
 * Owner and preview: the owner's own venue, checked with the owner's session.
 * Hall device: the paired venue, read on the server from the device cookie (point-device.server.ts),
 * so the QR shows with no account on the device. The sticker download stays with the owner.
 */
async function loadDocumentsQr(mode: BusinessCabinetMode, pointVenue: Awaited<ReturnType<typeof loadPointDeviceVenue>>) {
  if (mode === "point") {
    const publicId = pointVenue?.licencePublicId ?? null;
    const qrUrl = publicId && isVenueLicencePublicEnabled() && isVenueLicencePublicId(publicId) ? venueLicencePublicUrl(publicId) : null;
    return { qrUrl, sticker: null };
  }
  const domain = await loadBusinessOwnerHomeContext();
  const locationId = domain.status === "authenticated" ? domain.location?.id ?? null : null;
  const own = await loadOwnVenueSticker(locationId);
  return {
    qrUrl: own ? venueLicencePublicUrl(own.publicId) : null,
    sticker: own && businessCabinetCan({ mode }, "stickerDownload") ? own : null,
  };
}

export default async function BusinessAppDocumentsPage({ searchParams }: PageProps) {
  const hostname = getHostnameFromHeaders(await headers());
  const sp = await searchParams;
  const at = first(sp.at);
  const windowMinutes = first(sp.window);
  const cabinet = await loadBusinessCabinetMode();
  const pointVenue = cabinet.mode === "point" ? await loadPointDeviceVenue() : null;
  const reportVenue: PlaybackReportVenue | null = pointVenue
    ? {
        organizationId: pointVenue.organizationId,
        locationId: pointVenue.locationId,
        locationName: pointVenue.locationName,
        timezone: pointVenue.timezone ?? null,
      }
    : null;
  const result =
    cabinet.mode === "point" && !reportVenue
      ? ({ kind: "no_location" } as const)
      : await loadPlaybackReport({ at, windowMinutes, venue: reportVenue });
  const { qrUrl, sticker } = await loadDocumentsQr(cabinet.mode, pointVenue);
  const venueSide = cabinet.mode !== "owner";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <InspectorContactCard qrUrl={qrUrl} />
      {venueSide ? (
        <section className="business-app-card" data-testid="biz-documents-hall-contact">
          <ProfileHelpContact />
        </section>
      ) : null}

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
                <span className="mt-1 inline-block text-sm font-semibold text-[var(--biz-accent)]">Посмотреть</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--biz-text-muted)]">
          Получили претензию или пришла проверка? Ничего не подписывайте по
          существу и не платите на месте. Сообщите нам через раздел «Помощь»
          в течение 3 рабочих дней, а лучше в тот же день – сроки и исключения
          (обязательные по закону действия, поздно полученный иск, отсутствие
          нашего ответа) указаны в пп. 2.1–2.2 «Порядка защиты клиента».
        </p>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">
          Без нашего письменного согласия не признавайте требования, не платите
          и не заключайте мировое соглашение, если этого не требует закон, суд
          или государственный орган. Мы помогаем документами, письменной позицией
          и участием в деле; возмещение возможно только по вступившему в законную силу
          судебному акту на условиях раздела 4 порядка.
        </p>
      </section>

      {sticker ? (
        <VenueLicenceStickerCard locationId={sticker.locationId} publicId={sticker.publicId} />
      ) : null}

      <section className="business-app-card" data-testid="playback-report">
        <h2 className="text-[1.2rem] font-bold text-[var(--biz-text)]">
          Что играло в заведении в нужное время
        </h2>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">
          Отчёт строится по сообщениям плеера АудиоЛад о воспроизведении, которые принял
          сервер: сервер проверяет плеер и кофейню и фиксирует время получения, время начала
          и длительность сообщает плеер. Время – по часовому поясу кофейни.
        </p>
        {result.kind === "anonymous" ? (
          <p className="mt-3 text-sm"><a href={businessAuthHref(hostname, "sign-in")} className="underline">Войдите</a>, чтобы построить отчёт.</p>
        ) : result.kind === "no_location" ? (
          venueSide ? (
            <p className="mt-3 text-sm">Отчёт появится, когда устройство будет связано с кофейней.</p>
          ) : (
            <p className="mt-3 text-sm">Сначала <Link href="/onboarding" className="underline">добавьте кофейню</Link>.</p>
          )
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
                  className="business-app-input"
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
                  className="business-app-input w-24"
                />
              </label>
              <button type="submit" className="business-app-btn business-app-btn-primary business-app-focus-ring">
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
                  {formatVenueTime(result.report.fromUtc, result.report.timezone)} –{" "}
                  {formatVenueTime(result.report.toUtc, result.report.timezone)}
                </p>
                {result.report.tracks.length === 0 ? (
                  <p className="mt-3 text-sm">
                    В этом интервале сервер не получал данных о воспроизведении в кофейне.
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
                  музыка была слышна в помещении и что в кофейне не звучала другая
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

export async function generateMetadata() {
  return buildCoffeePublicPageMetadata(getHostnameFromHeaders(await headers()), "/documents", "Документы – АудиоЛад Кофе", "Действующие документы и условия использования музыки в кофейне.");
}
