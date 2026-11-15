'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PASSPORT_FIELDS, passportMissing, type Passport, type PassportField } from '@/lib/business-track-passports/model';
import { closedCatalogAction } from './actions';

export function CreateClosedAlbum({ authors }: { authors: { id: string; name: string }[] }) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return <form action={(form) => start(async () => {
    const result = await closedCatalogAction('create', '', Object.fromEntries(form));
    setMessage(result.message); if (result.ok) router.refresh();
  })} className="space-x-3">
    <label>Автор <select name="author_id" required>{authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>Название <input name="title" required maxLength={300} /></label>
    <button disabled={pending || !authors.length}>Создать закрытый альбом</button>
    {!authors.length && <p>Для загрузки нужен доступ владельца или редактора к автору.</p>}
    <p role="status">{message}</p>
  </form>;
}
export default function PassportForm({ audioItemId, passport }: { audioItemId: string; passport?: Passport }) {
  const [fields, setFields] = useState<Passport>(passport ?? {});
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const missing = passportMissing(fields);
  const locked = passport?.status === 'approved' || passport?.status === 'revoked';
  const run = (command: string) => start(async () => {
    const result = await closedCatalogAction(command, audioItemId, fields);
    setMessage(result.message);
    if (result.ok) { setDirty(false); router.refresh(); }
  });
  return <div className="space-y-3">
    <p>Паспорт: {passport?.status === 'approved' ? 'допущен' : passport?.status === 'revoked' ? 'отозван' : 'черновик'}</p>
    <p>Доказательства заполняются вручную. Ссылки ведут на сохранённые материалы проверки.</p>
    <div className="grid gap-3 sm:grid-cols-2">{Object.entries(PASSPORT_FIELDS).map(([key, label]) => {
      const field = key as PassportField;
      const choices = field === 'human_contribution' ? [['none', 'Нет'], ['human', 'Есть']]
        : field === 'shazam_result' || field === 'acoustid_result' ? [['not_found', 'Совпадений нет'], ['match', 'Найдено совпадение']] : null;
      const update = (value: string) => { setFields({ ...fields, [field]: value }); setDirty(true); };
      return <label key={field} className="block">{label}{choices
        ? <select className="block border" value={fields[field] ?? ''} disabled={pending || locked} onChange={(e) => update(e.target.value)}><option value="">Выберите</option>{choices.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        : <input className="block w-full border" value={fields[field] ?? ''} disabled={pending || locked}
          placeholder={field.endsWith('_at') ? 'ГГГГ-ММ-ДДTЧЧ:ММ:СС+03:00' : undefined}
          onChange={(e) => update(e.target.value)} />}</label>;
    })}</div>
    <p>Хеш сохранённого мастера: {passport?.stored_master_sha256 ?? 'не проверен'}</p>
    <p>Сравнение: {passport?.stored_master_sha256 ? fields.master_sha256 === passport.stored_master_sha256 ? 'совпадает' : 'не совпадает' : 'сначала проверьте файл'}</p>
    <button disabled={pending || locked} onClick={() => run('save')}>Сохранить черновик</button>{' '}
    <button disabled={pending || locked || dirty || !passport} onClick={() => run('verify')}>Проверить хеш сохранённого мастера</button>{' '}
    <button disabled={pending || locked || dirty || missing.length > 0} onClick={() => run('approve')}>Допустить в Бизнес</button>{' '}
    <button disabled={pending || passport?.status !== 'approved'} onClick={() => run('revoke')}>Отозвать</button>
    {dirty && <p>Сохраните черновик перед проверкой и допуском.</p>}
    {!locked && missing.length > 0 && <ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul>}
    {passport?.status === 'revoked' && <p>Допуск отозван. Для повторной проверки загрузите новую версию мастер-файла.</p>}
    <p role="status">{message}</p>
  </div>;
}
