'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Passport } from '@/lib/business-track-passports/model';
import {
  DEFAULT_CATALOG_PASSPORT_DEFAULTS,
  adminPassportLicensePreviewHref,
  isBusinessPassportLicenseRef,
  type CatalogPassportDefaults,
} from '@/lib/business-track-passports/shared';
import {
  autoFillPassportTrackAction,
  approveReadyPassportsAction,
  uploadPassportLicenseAction,
  saveCatalogDefaultsAction,
} from './actions';

const fieldClassName =
  'block w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#fbf8ff] disabled:text-[#7d70a2]';
const primaryButtonClassName =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';
const secondaryButtonClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';

type Track = { id: string; title: string; music_track_code?: string | null; passport?: Passport };
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
        <input className={`${fieldClassName} mt-2`} value={value.human_contribution_details} disabled={pending || value.human_contribution !== 'human'} onChange={(event) => onChange({ ...value, human_contribution_details: event.target.value })} />
      </label>
    </div>
  );
}

async function fillTracks(tracks: Track[], reportLine: (line: string) => void): Promise<boolean> {
  let allOk = true;
  for (const track of tracks) {
    if (track.passport?.status === 'approved' || track.passport?.status === 'revoked') {
      reportLine(`${track.title}: пропущен, паспорт уже допущен или отозван.`);
      continue;
    }
    const result = await autoFillPassportTrackAction(track.id);
    allOk = allOk && result.ok;
    const extra = [...result.errors, ...result.skipped].filter(Boolean);
    reportLine(`${result.title || track.title}: ${result.message}${extra.length ? ` ${extra.join(' ')}` : ''}`);
  }
  return allOk;
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
  const [logs, setLogs] = useState<string[]>([]);
  const [fields, setFields] = useState(catalogDefaults ?? DEFAULT_CATALOG_PASSPORT_DEFAULTS);
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
            const lines: string[] = [];
            let allOk = true;
            for (const album of albums) {
              const albumOk = await fillTracks(album.tracks, (line) => lines.push(line));
              allOk = allOk && albumOk;
            }
            setOk(allOk);
            setLogs(lines);
            setMessage(allOk
              ? 'Автоматическое заполнение всех закрытых альбомов завершено. Осталось указать Shazam у каждого трека и допустить паспорта.'
              : 'Автоматическое заполнение завершено с ошибками.');
            router.refresh();
          })}
        >
          Заполнить автоматически все закрытые альбомы
        </button>
      </div>
      {logs.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[#5f5484]">
          {logs.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
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
  catalogDefaults,
  albumDefaults,
}: {
  albumId: string;
  tracks: Track[];
  licenseRef: string | null;
  catalogLicenseRef: string | null;
  catalogDefaults: CatalogPassportDefaults;
  albumDefaults?: CatalogPassportDefaults | null;
}) {
  const router = useRouter();
  const initialOverride = useMemo(() => albumDefaults ?? catalogDefaults ?? DEFAULT_CATALOG_PASSPORT_DEFAULTS, [albumDefaults, catalogDefaults]);
  const [fields, setFields] = useState(initialOverride);
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
      <p className="text-sm leading-6 text-[#5f5484]">
        Общие поля подставляются из настроек каталога, дата генерации – из даты загрузки мастера, ссылка на историю не нужна. Нажмите «Заполнить автоматически», затем у каждого трека укажите только результат Shazam и дату и нажмите «Допустить в Бизнес». Автоматического допуска нет.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || tracks.length === 0}
          className={secondaryButtonClassName}
          onClick={() => start(async () => {
            const lines: string[] = [];
            const allOk = await fillTracks(tracks, (line) => lines.push(line));
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
