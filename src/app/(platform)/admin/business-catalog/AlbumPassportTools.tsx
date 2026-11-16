'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Passport } from '@/lib/business-track-passports/model';
import {
  DEFAULT_CATALOG_PASSPORT_DEFAULTS,
  HUMAN_CONTRIBUTION_DETAILS_PLACEHOLDER,
  adminPassportLicensePreviewHref,
  albumFormPassportDefaults,
  isBusinessPassportLicenseRef,
  type CatalogPassportDefaults,
} from '@/lib/business-track-passports/shared';
import {
  autoFillPassportTrackAction,
  approveReadyPassportsAction,
  uploadPassportLicenseAction,
  saveCatalogDefaultsAction,
} from './actions';
import {
  albumAdmissionState,
  summarizeAutoFill,
  type AutoFillSummary,
  type AutoFillTrackView,
} from '@/lib/business-track-passports/admission-ui';
import type { ShazamCheckRow } from '@/lib/business-track-passports/shazam';

const fieldClassName =
  'block w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#fbf8ff] disabled:text-[#7d70a2]';
const primaryButtonClassName =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';
const secondaryButtonClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';

type Track = { id: string; title: string; music_track_code?: string | null; passport?: Passport; shazamCheck?: ShazamCheckRow | null };
type AlbumTools = {
  id: string;
  tracks: Track[];
  licenseRef?: string | null;
  defaults?: CatalogPassportDefaults | null;
};

function LicenseUpload({
  scope,
  albumId,
  licenseRef,
  catalogLicenseRef,
  pending,
  onDone,
}: {
  scope: 'catalog' | 'album';
  albumId?: string;
  licenseRef: string | null;
  catalogLicenseRef?: string | null;
  pending: boolean;
  onDone: (ok: boolean, message: string) => void;
}) {
  const router = useRouter();
  const [uploading, startUpload] = useTransition();
  const busy = pending || uploading;
  const preview = licenseRef
    ? adminPassportLicensePreviewHref(scope === 'catalog' ? 'catalog' : { albumId: albumId! })
    : catalogLicenseRef
      ? adminPassportLicensePreviewHref('catalog')
      : null;
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-[#5f5484]">
        Один образец лицензии загружается один раз и закрыто хранится в кабинете. Он заполняет условия тарифа у всех черновиков. Лицензию каждого трека загружать не нужно – она остаётся в истории MusicGPT и её можно запросить отдельно. ID лицензии трека указывать необязательно, без него допуск не блокируется.
      </p>
      {preview ? (
        <p className="text-sm leading-6 text-[#5f5484]">
          {licenseRef ? 'Загруженный образец: ' : 'Будет использован образец каталога: '}
          <a href={preview} target="_blank" rel="noreferrer" className="font-medium text-[#7042c5] underline-offset-2 hover:underline">открыть PDF</a>
        </p>
      ) : (
        <p className="text-sm leading-6 text-[#7d70a2]">Образец лицензии ещё не загружен.</p>
      )}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          data.set('scope', scope === 'catalog' ? 'catalog' : 'album');
          if (albumId) data.set('albumId', albumId);
          startUpload(async () => {
            const result = await uploadPassportLicenseAction(data);
            onDone(result.ok, result.message);
            if (result.ok) { form.reset(); router.refresh(); }
          });
        }}
      >
        <label className="block min-w-0 flex-1 text-sm font-medium text-[#25135c]">
          PDF образца лицензии
          <input type="file" name="file" accept="application/pdf,.pdf" required disabled={busy} className={`${fieldClassName} mt-2`} />
        </label>
        <button type="submit" disabled={busy} className={secondaryButtonClassName}>
          {scope === 'catalog' ? 'Сохранить образец для каталога' : 'Сохранить образец для альбома'}
        </button>
      </form>
    </div>
  );
}

function DefaultsFields({
  value,
  pending,
  onChange,
}: {
  value: CatalogPassportDefaults;
  pending: boolean;
  onChange: (next: CatalogPassportDefaults) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium text-[#25135c]">
        Инструмент генерации
        <input className={`${fieldClassName} mt-2`} value={value.generator_tool} disabled={pending} onChange={(event) => onChange({ ...value, generator_tool: event.target.value })} />
      </label>
      <label className="block text-sm font-medium text-[#25135c]">
        Тариф генератора
        <input className={`${fieldClassName} mt-2`} value={value.generator_plan} disabled={pending} onChange={(event) => onChange({ ...value, generator_plan: event.target.value })} />
      </label>
      <label className="block text-sm font-medium text-[#25135c]">
        Вклад человека
        <select className={`${fieldClassName} mt-2`} value={value.human_contribution} disabled={pending} onChange={(event) => onChange({ ...value, human_contribution: event.target.value === 'none' ? 'none' : 'human' })}>
          <option value="human">Есть</option>
          <option value="none">Нет</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-[#25135c]">
        Описание вклада человека
        <input
          className={`${fieldClassName} mt-2`}
          value={value.human_contribution_details}
          placeholder={HUMAN_CONTRIBUTION_DETAILS_PLACEHOLDER}
          disabled={pending || value.human_contribution !== 'human'}
          onChange={(event) => onChange({ ...value, human_contribution_details: event.target.value })}
        />
      </label>
    </div>
  );
}

async function fillTracks(tracks: Track[]): Promise<AutoFillTrackView[]> {
  const results: AutoFillTrackView[] = [];
  for (const track of tracks) {
    if (track.passport?.status === 'approved' || track.passport?.status === 'revoked') {
      results.push({ title: track.title, ok: true, errors: [], skipped: [], message: '', alreadyDecided: true });
      continue;
    }
    const result = await autoFillPassportTrackAction(track.id);
    results.push({
      title: result.title || track.title,
      ok: result.ok,
      errors: result.errors,
      skipped: result.skipped,
      message: result.message,
      alreadyDecided: result.skipped.some((item) => item.startsWith('Паспорт уже допущен или отозван')),
    });
  }
  return results;
}

const noticeClassName: Record<AutoFillSummary['tone'], string> = {
  ok: 'rounded-[18px] border border-[#eadff8] bg-white px-4 py-3 text-sm text-[#5f5484]',
  notice: 'rounded-[18px] border border-[#f1d9a6] bg-[#fff8e8] px-4 py-3 text-sm text-[#8a5a00]',
  error: 'rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]',
};

function AutoFillResult({ summary }: { summary: AutoFillSummary | null }) {
  if (!summary) return null;
  return (
    <div className="space-y-2" data-autofill-result={summary.tone}>
      <p role="status" className={noticeClassName[summary.tone]}>{summary.message}</p>
      {summary.notes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-[#7d70a2]">
          {summary.notes.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
      {summary.lines.length > 0 ? (
        <details className="text-sm text-[#5f5484]">
          <summary className="cursor-pointer">По трекам ({summary.lines.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {summary.lines.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

type ApprovalView = { approvedLine: string; refusedLine: string | null; errorLines: string[]; approvedAny: boolean } | { failure: string };

function ApprovalResult({ view }: { view: ApprovalView | null }) {
  if (!view) return null;
  if ('failure' in view) {
    return <p role="status" className={noticeClassName.error} data-approval-result="error">{view.failure}</p>;
  }
  return (
    <div role="status" className="space-y-2" data-approval-result="">
      <p
        className={view.approvedAny
          ? 'rounded-[18px] border border-[#bfe5cd] bg-[#eefaf2] px-4 py-3 text-sm font-semibold text-[#1f7a46]'
          : 'rounded-[18px] border border-[#eadff8] bg-white px-4 py-3 text-sm font-semibold text-[#5f5484]'}
        data-approval-approved=""
      >
        {view.approvedLine}
      </p>
      {view.refusedLine ? (
        <p className={noticeClassName.notice} data-approval-refused="">{view.refusedLine}</p>
      ) : null}
      {view.errorLines.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-[#5f5484]">
          {view.errorLines.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function CatalogSettingsPanel({
  catalogLicenseRef,
  catalogDefaults,
  albums,
}: {
  catalogLicenseRef: string | null;
  catalogDefaults: CatalogPassportDefaults;
  albums: AlbumTools[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [fillSummary, setFillSummary] = useState<AutoFillSummary | null>(null);
  const savedCatalogFields = catalogDefaults ?? DEFAULT_CATALOG_PASSPORT_DEFAULTS;
  const [fields, setFields] = useState(savedCatalogFields);
  const [savedCatalogKey, setSavedCatalogKey] = useState(() => JSON.stringify(savedCatalogFields));
  const nextCatalogKey = JSON.stringify(savedCatalogFields);
  if (nextCatalogKey !== savedCatalogKey) {
    const dirty = JSON.stringify(fields) !== savedCatalogKey;
    setSavedCatalogKey(nextCatalogKey);
    if (!dirty) setFields(savedCatalogFields);
  }
  const trackCount = albums.reduce((sum, album) => sum + album.tracks.length, 0);

  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white p-5" data-catalog-license-panel="" data-catalog-settings-panel="">
      <h3 className="text-[18px] font-semibold text-[#25135c]">Настройки каталога</h3>
      <p className="mt-2 text-sm leading-6 text-[#5f5484]">
        Инструмент, тариф и вклад человека задаются один раз для всего закрытого каталога. Их можно поменять здесь, если сменится тариф. Дата генерации берётся из даты загрузки мастер-файла, ссылку на историю MusicGPT указывать не нужно – в паспорт записывается нейтральная отсылка к истории аккаунта и названию трека.
      </p>
      <div className="mt-4">
        <LicenseUpload
          scope="catalog"
          licenseRef={catalogLicenseRef}
          pending={pending}
          onDone={(nextOk, nextMessage) => { setOk(nextOk); setMessage(nextMessage); }}
        />
      </div>
      <div className="mt-5">
        <DefaultsFields value={fields} pending={pending} onChange={setFields} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className={secondaryButtonClassName}
          onClick={() => start(async () => {
            const result = await saveCatalogDefaultsAction('catalog', '', fields);
            setOk(result.ok);
            setMessage(result.message);
            if (result.ok) router.refresh();
          })}
        >
          Сохранить настройки каталога
        </button>
        <button
          type="button"
          disabled={pending || trackCount === 0}
          className={primaryButtonClassName}
          onClick={() => start(async () => {
            const saved = await saveCatalogDefaultsAction('catalog', '', fields);
            if (!saved.ok) {
              setOk(false);
              setMessage(saved.message);
              return;
            }
            setMessage('');
            setOk(null);
            const results: AutoFillTrackView[] = [];
            for (const album of albums) results.push(...await fillTracks(album.tracks));
            setFillSummary(summarizeAutoFill(results));
            router.refresh();
          })}
        >
          Заполнить автоматически все закрытые альбомы
        </button>
      </div>
      {fillSummary ? <div className="mt-4"><AutoFillResult summary={fillSummary} /></div> : null}
      <p
        role="status"
        className={message
          ? ok
            ? 'mt-4 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#5f5484]'
            : 'mt-4 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]'
          : undefined}
      >
        {message}
      </p>
    </section>
  );
}

export default function AlbumPassportTools({
  albumId,
  albumStatus,
  tracks,
  licenseRef,
  catalogLicenseRef,
  catalogDefaults,
  albumDefaults,
}: {
  albumId: string;
  albumStatus?: string;
  tracks: Track[];
  licenseRef: string | null;
  catalogLicenseRef: string | null;
  catalogDefaults: CatalogPassportDefaults;
  albumDefaults?: CatalogPassportDefaults | null;
}) {
  const router = useRouter();
  const initialOverride = useMemo(() => albumFormPassportDefaults(albumDefaults, catalogDefaults), [albumDefaults, catalogDefaults]);
  const [fields, setFields] = useState(initialOverride);
  const [savedOverrideKey, setSavedOverrideKey] = useState(() => JSON.stringify(initialOverride));
  const nextOverrideKey = JSON.stringify(initialOverride);
  if (nextOverrideKey !== savedOverrideKey) {
    const dirty = JSON.stringify(fields) !== savedOverrideKey;
    setSavedOverrideKey(nextOverrideKey);
    if (!dirty) setFields(initialOverride);
  }
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [fillSummary, setFillSummary] = useState<AutoFillSummary | null>(null);
  const [approval, setApproval] = useState<ApprovalView | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const admission = useMemo(() => albumAdmissionState(tracks.map((track) => ({
    passport: track.passport ?? null,
    shazamActive: track.shazamCheck?.status === 'pending' || track.shazamCheck?.status === 'running',
  }))), [tracks]);
  const nothingReady = admission.ready === 0;

  const report = (nextOk: boolean, nextMessage: string) => {
    setOk(nextOk);
    setMessage(nextMessage);
  };

  return (
    <div className="space-y-5 rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] p-4" data-album-passport-tools="">
      <p className="text-sm leading-6 text-[#5f5484]">
        Общие поля подставляются из настроек каталога, дата генерации – из даты загрузки мастера, ссылка на историю не нужна. Нажмите «Заполнить автоматически»: хеши и AcoustID посчитаются сразу, а Shazam проверит каждый трек в фоне и сам запишет «совпадений нет» с датой. Если Shazam что-то найдёт, это будет показано у трека. Затем нажмите «Допустить в Бизнес». Автоматического допуска нет.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || tracks.length === 0}
          className={secondaryButtonClassName}
          onClick={() => start(async () => {
            report(true, '');
            const results = await fillTracks(tracks);
            setFillSummary(summarizeAutoFill(results));
            router.refresh();
          })}
        >
          Заполнить автоматически
        </button>
        {admission.complete ? (
          <span
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#e8f6ee] px-6 text-sm font-semibold text-[#1f7a46]"
            data-album-admitted=""
          >
            {albumStatus === 'published' ? 'Альбом в каталоге Бизнеса ✓' : 'Все треки допущены ✓ – осталось опубликовать альбом'}
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={pending || nothingReady}
              className={primaryButtonClassName}
              data-approve-ready=""
              onClick={() => {
                if (!confirmBulk) {
                  setConfirmBulk(true);
                  report(true, `Будут допущены только треки, которые уже проходят обычную проверку паспорта (готово: ${admission.ready}). Нажмите ещё раз, чтобы подтвердить.`);
                  return;
                }
                start(async () => {
                  const result = await approveReadyPassportsAction(albumId);
                  setConfirmBulk(false);
                  report(true, '');
                  if ('approvedLine' in result) {
                    setApproval({
                      approvedLine: result.approvedLine,
                      refusedLine: result.refusedLine,
                      errorLines: result.errorLines,
                      approvedAny: result.summary.approvedTotal > 0,
                    });
                  } else {
                    setApproval({ failure: result.message });
                  }
                  // Always reload the album so the counters and the badge follow the result.
                  router.refresh();
                });
              }}
            >
              {confirmBulk && !nothingReady ? 'Подтвердить допуск готовых' : 'Допустить все готовые'}
            </button>
            {admission.approved > 0 ? (
              <span className="text-sm font-semibold text-[#1f7a46]" data-album-partial="">
                Допущено {admission.approved} из {admission.total}
              </span>
            ) : null}
          </>
        )}
      </div>
      {!admission.complete && admission.hint ? (
        <p className={noticeClassName.notice} data-album-hint="">{admission.hint}</p>
      ) : null}
      <ApprovalResult view={approval} />
      <AutoFillResult summary={fillSummary} />
      <details className="rounded-[18px] border border-[#e4d7f4] bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-[#25135c]">Изменить для этого альбома</summary>
        <div className="mt-3 space-y-4">
          <p className="text-sm leading-6 text-[#5f5484]">Если у этого альбома другой тариф или вклад человека, сохраните отдельные настройки. Они заменят каталожные только для этого альбома.</p>
          <LicenseUpload
            scope="album"
            albumId={albumId}
            licenseRef={licenseRef}
            catalogLicenseRef={catalogLicenseRef}
            pending={pending}
            onDone={(nextOk, nextMessage) => start(() => report(nextOk, nextMessage))}
          />
          <DefaultsFields value={fields} pending={pending} onChange={setFields} />
          <button
            type="button"
            disabled={pending}
            className={secondaryButtonClassName}
            onClick={() => start(async () => {
              const result = await saveCatalogDefaultsAction('album', albumId, fields);
              report(result.ok, result.message);
              if (result.ok) router.refresh();
            })}
          >
            Сохранить настройки альбома
          </button>
        </div>
      </details>
      {isBusinessPassportLicenseRef(licenseRef) || isBusinessPassportLicenseRef(catalogLicenseRef) ? (
        <p className="text-sm leading-6 text-[#5f5484]">Условия тарифа заполняются закрытым образцом лицензии.</p>
      ) : null}
      <p
        role="status"
        className={message
          ? ok
            ? 'rounded-[18px] border border-[#eadff8] bg-white px-4 py-3 text-sm text-[#5f5484]'
            : 'rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]'
          : undefined}
      >
        {message}
      </p>
    </div>
  );
}
