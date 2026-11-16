'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Passport } from '@/lib/business-track-passports/model';
import {
  ALBUM_SHARED_FIELD_LABELS,
  ALBUM_SHARED_PASSPORT_FIELDS,
  adminPassportLicensePreviewHref,
  isBusinessPassportLicenseRef,
  pickAlbumSharedPassport,
} from '@/lib/business-track-passports/shared';
import {
  applyAlbumSharedPassportAction,
  autoFillPassportTrackAction,
  approveReadyPassportsAction,
  uploadPassportLicenseAction,
} from './actions';

const fieldClassName =
  'block w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#fbf8ff] disabled:text-[#7d70a2]';
const primaryButtonClassName =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';
const secondaryButtonClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';

type Track = { id: string; title: string; music_track_code?: string | null; passport?: Passport };

function firstDraftShared(tracks: Track[]): Record<string, string> {
  const draft = tracks.find((track) => track.passport && track.passport.status !== 'approved' && track.passport.status !== 'revoked')
    ?? tracks.find((track) => track.passport);
  return draft?.passport ? pickAlbumSharedPassport(draft.passport) : pickAlbumSharedPassport({});
}

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
        Один образец лицензии (тип/шаблон) загружается один раз и закрыто хранится в кабинете. Он заполняет «ссылку на сохранённые условия тарифа» у всех черновиков. Лицензию каждого трека загружать не нужно – она остаётся в истории MusicGPT и её можно запросить отдельно. ID лицензии трека указывать необязательно, без него допуск не блокируется.
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
          <input
            type="file"
            name="file"
            accept="application/pdf,.pdf"
            required
            disabled={busy}
            className={`${fieldClassName} mt-2`}
          />
        </label>
        <button type="submit" disabled={busy} className={secondaryButtonClassName}>
          {scope === 'catalog' ? 'Сохранить образец для каталога' : 'Сохранить образец для альбома'}
        </button>
      </form>
    </div>
  );
}

export function CatalogLicensePanel({ catalogLicenseRef }: { catalogLicenseRef: string | null }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white p-5" data-catalog-license-panel="">
      <h3 className="text-[18px] font-semibold text-[#25135c]">Образец лицензии каталога</h3>
      <div className="mt-3">
        <LicenseUpload
          scope="catalog"
          licenseRef={catalogLicenseRef}
          pending={pending}
          onDone={(nextOk, nextMessage) => start(() => { setOk(nextOk); setMessage(nextMessage); })}
        />
      </div>
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
  tracks,
  licenseRef,
  catalogLicenseRef,
}: {
  albumId: string;
  tracks: Track[];
  licenseRef: string | null;
  catalogLicenseRef: string | null;
}) {
  const router = useRouter();
  const initial = useMemo(() => firstDraftShared(tracks), [tracks]);
  const [fields, setFields] = useState(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const draftCount = tracks.filter((track) => track.passport?.status !== 'approved' && track.passport?.status !== 'revoked').length;

  const report = (nextOk: boolean, nextMessage: string, extra: string[] = []) => {
    setOk(nextOk);
    setMessage(nextMessage);
    if (extra.length) setLogs(extra);
  };

  return (
    <div className="space-y-5 rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] p-4" data-album-passport-tools="">
      <div>
        <h4 className="text-sm font-semibold text-[#25135c]">Общие данные паспорта альбома</h4>
        <p className="mt-2 text-sm leading-6 text-[#5f5484]">
          Заполните один раз и примените ко всем черновикам треков этого альбома. Поля каждого трека после этого можно поправить отдельно. Дата генерации – одна дата, не диапазон. «ID или ссылка генерации» – ссылка или номер из истории MusicGPT, это не ID лицензии трека.
        </p>
      </div>
      <LicenseUpload
        scope="album"
        albumId={albumId}
        licenseRef={licenseRef}
        catalogLicenseRef={catalogLicenseRef}
        pending={pending}
        onDone={(nextOk, nextMessage) => start(() => report(nextOk, nextMessage))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {ALBUM_SHARED_PASSPORT_FIELDS.map((field) => {
          const label = ALBUM_SHARED_FIELD_LABELS[field];
          if (field === 'human_contribution') {
            return (
              <label key={field} className="block text-sm font-medium text-[#25135c]">
                {label}
                <select
                  className={`${fieldClassName} mt-2`}
                  value={fields[field]}
                  disabled={pending}
                  onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
                >
                  <option value="">Выберите</option>
                  <option value="none">Нет</option>
                  <option value="human">Есть</option>
                </select>
              </label>
            );
          }
          return (
            <label key={field} className="block text-sm font-medium text-[#25135c]">
              {label}
              <input
                className={`${fieldClassName} mt-2`}
                value={fields[field]}
                disabled={pending}
                placeholder={field.endsWith('_at') ? 'ГГГГ-ММ-ДДTЧЧ:ММ:СС+03:00' : field === 'terms_snapshot_ref' ? 'Можно оставить пустым – подставится образец лицензии' : undefined}
                onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
              />
              {field === 'terms_snapshot_ref' ? (
                <span className="mt-1 block text-xs font-normal leading-5 text-[#7d70a2]">Если поле пустое, подставится закрытая ссылка на загруженный образец лицензии альбома или каталога.</span>
              ) : null}
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || tracks.length === 0}
          className={secondaryButtonClassName}
          onClick={() => start(async () => {
            const result = await applyAlbumSharedPassportAction(albumId, fields);
            report(result.ok, result.message);
            if (result.ok) router.refresh();
          })}
        >
          Применить ко всем черновикам альбома
        </button>
        <button
          type="button"
          disabled={pending || tracks.length === 0}
          className={secondaryButtonClassName}
          onClick={() => start(async () => {
            const lines: string[] = [];
            let allOk = true;
            for (const track of tracks) {
              if (track.passport?.status === 'approved' || track.passport?.status === 'revoked') {
                lines.push(`${track.title}: пропущен, паспорт уже допущен или отозван.`);
                continue;
              }
              const result = await autoFillPassportTrackAction(track.id);
              allOk = allOk && result.ok;
              const extra = [...result.errors, ...result.skipped].filter(Boolean);
              lines.push(`${result.title || track.title}: ${result.message}${extra.length ? ` ${extra.join(' ')}` : ''}`);
            }
            report(allOk, allOk ? 'Автоматическое заполнение завершено. Осталось указать Shazam и допустить треки вручную.' : 'Автоматическое заполнение завершено с ошибками.', lines);
            router.refresh();
          })}
        >
          Заполнить автоматически
        </button>
        <button
          type="button"
          disabled={pending || draftCount === 0}
          className={primaryButtonClassName}
          onClick={() => {
            if (!confirmBulk) {
              setConfirmBulk(true);
              report(true, 'Будут допущены только треки, которые уже проходят обычную проверку паспорта. Нажмите ещё раз, чтобы подтвердить.');
              return;
            }
            start(async () => {
              const result = await approveReadyPassportsAction(albumId);
              setConfirmBulk(false);
              report(result.ok, result.message);
              if (result.ok || ('approved' in result && result.approved > 0)) router.refresh();
            });
          }}
        >
          {confirmBulk ? 'Подтвердить допуск готовых' : 'Допустить все готовые'}
        </button>
      </div>
      <p className="text-sm leading-6 text-[#5f5484]">
        Автоматически считаются хеш мастера, хеш исходника, если он есть, аудиоотпечаток и AcoustID. Результат Shazam и дату проверки нужно указать вручную у каждого трека, затем нажать «Допустить в Бизнес». Автоматического допуска нет.
      </p>
      {isBusinessPassportLicenseRef(fields.terms_snapshot_ref) ? (
        <p className="text-sm leading-6 text-[#5f5484]">
          В условиях тарифа указан закрытый образец лицензии.
        </p>
      ) : null}
      {logs.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-[#5f5484]">
          {logs.map((line) => <li key={line}>{line}</li>)}
        </ul>
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
