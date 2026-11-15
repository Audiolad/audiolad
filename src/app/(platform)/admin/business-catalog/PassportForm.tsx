'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PASSPORT_FIELDS, passportMissing, type Passport, type PassportField } from '@/lib/business-track-passports/model';
import { closedCatalogAction } from './actions';

const fieldClassName =
  'block w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#fbf8ff] disabled:text-[#7d70a2]';
const primaryButtonClassName =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';
const secondaryButtonClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';
const dangerButtonClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#ebc9c9] px-4 py-2 text-sm font-semibold text-[#9b3d3d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b3d3d] disabled:opacity-60';

export function CreateClosedAlbum({ authors }: { authors: { id: string; name: string }[] }) {
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return <form action={(form) => start(async () => {
    const result = await closedCatalogAction('create', '', Object.fromEntries(form));
    setMessage(result.message); setOk(result.ok); if (result.ok) router.refresh();
  })} className="space-y-5">
    <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
      <h2 className="text-[18px] font-semibold text-[#25135c]">Новый закрытый альбом</h2>
      <p className="mt-2 text-sm leading-6 text-[#5f5484]">
        Выберите автора и название. После создания можно загрузить треки, мастер-файлы и обложку.
      </p>
      <label className="mt-5 block">
        <span className="mb-2 block text-sm font-medium text-[#25135c]">Автор</span>
        <select name="author_id" required disabled={!authors.length} className={fieldClassName}>
          {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium text-[#25135c]">Название</span>
        <input name="title" required maxLength={300} placeholder="Название альбома" className={fieldClassName} />
      </label>
      {!authors.length && (
        <p className="mt-4 text-sm leading-6 text-[#7d70a2]">Для загрузки нужен доступ владельца или редактора к автору.</p>
      )}
      <div className="mt-5">
        <button type="submit" disabled={pending || !authors.length} className={primaryButtonClassName}>
          Создать закрытый альбом
        </button>
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
  </form>;
}

export default function PassportForm({ audioItemId, passport }: { audioItemId: string; passport?: Passport }) {
  const [fields, setFields] = useState<Passport>(passport ?? {});
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const missing = passportMissing(fields);
  const locked = passport?.status === 'approved' || passport?.status === 'revoked';
  const run = (command: string) => start(async () => {
    const result = await closedCatalogAction(command, audioItemId, fields);
    setMessage(result.message);
    setOk(result.ok);
    if (result.ok) { setDirty(false); router.refresh(); }
  });
  return <div className="space-y-3 pt-3">
    <p className="text-sm text-[#5f5484]">Паспорт: {passport?.status === 'approved' ? 'допущен' : passport?.status === 'revoked' ? 'отозван' : 'черновик'}</p>
    <p className="text-sm leading-6 text-[#5f5484]">Доказательства заполняются вручную. Ссылки ведут на сохранённые материалы проверки.</p>
    <div className="grid gap-3 sm:grid-cols-2">{Object.entries(PASSPORT_FIELDS).map(([key, label]) => {
      const field = key as PassportField;
      const choices = field === 'human_contribution' ? [['none', 'Нет'], ['human', 'Есть']]
        : field === 'shazam_result' || field === 'acoustid_result' ? [['not_found', 'Совпадений нет'], ['match', 'Найдено совпадение']] : null;
      const update = (value: string) => { setFields({ ...fields, [field]: value }); setDirty(true); };
      return <label key={field} className="block text-sm font-medium text-[#25135c]">{label}{choices
        ? <select className={fieldClassName} value={fields[field] ?? ''} disabled={pending || locked} onChange={(e) => update(e.target.value)}><option value="">Выберите</option>{choices.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        : <input className={fieldClassName} value={fields[field] ?? ''} disabled={pending || locked}
          placeholder={field.endsWith('_at') ? 'ГГГГ-ММ-ДДTЧЧ:ММ:СС+03:00' : undefined}
          onChange={(e) => update(e.target.value)} />}</label>;
    })}</div>
    <p className="text-sm text-[#5f5484]">Хеш сохранённого мастера: {passport?.stored_master_sha256 ?? 'не проверен'}</p>
    <p className="text-sm text-[#5f5484]">Сравнение: {passport?.stored_master_sha256 ? fields.master_sha256 === passport.stored_master_sha256 ? 'совпадает' : 'не совпадает' : 'сначала проверьте файл'}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending || locked} onClick={() => run('save')} className={secondaryButtonClassName}>Сохранить черновик</button>
      <button type="button" disabled={pending || locked || dirty || !passport} onClick={() => run('verify')} className={secondaryButtonClassName}>Проверить хеш сохранённого мастера</button>
      <button type="button" disabled={pending || locked || dirty || missing.length > 0} onClick={() => run('approve')} className={primaryButtonClassName}>Допустить в Бизнес</button>
      <button type="button" disabled={pending || passport?.status !== 'approved'} onClick={() => run('revoke')} className={dangerButtonClassName}>Отозвать</button>
    </div>
    {dirty && <p className="text-sm text-[#7d70a2]">Сохраните черновик перед проверкой и допуском.</p>}
    {!locked && missing.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-[#7d70a2]">{missing.map((item) => <li key={item}>{item}</li>)}</ul>}
    {passport?.status === 'revoked' && <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">Допуск отозван. Для повторной проверки загрузите новую версию мастер-файла.</p>}
    <p
      role="status"
      className={message
        ? ok
          ? 'rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#5f5484]'
          : 'rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]'
        : undefined}
    >
      {message}
    </p>
  </div>;
}
