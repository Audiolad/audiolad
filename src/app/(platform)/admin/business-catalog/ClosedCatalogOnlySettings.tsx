'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CLOSED_CATALOG_ONLY_TOGGLE_HINT,
  CLOSED_CATALOG_ONLY_TOGGLE_LABEL,
  CLOSED_CATALOG_ONLY_TOGGLE_ROUTE,
  CLOSED_CATALOG_ONLY_TOGGLE_TITLE,
  isClosedCatalogOnlyAuthor,
} from '@/lib/authors/closed-catalog-only';

export type ClosedCatalogOnlyAuthor = {
  id: string;
  name: string;
  closedCatalogOnly?: boolean;
};

export default function ClosedCatalogOnlySettings({
  authors,
}: {
  authors: ClosedCatalogOnlyAuthor[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [pending, start] = useTransition();

  function toggle(authorId: string, enabled: boolean) {
    if (pending) return;
    setMessage('');
    setOk(null);
    setPendingId(authorId);
    start(async () => {
      try {
        const response = await fetch(CLOSED_CATALOG_ONLY_TOGGLE_ROUTE, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author_id: authorId, enabled }),
        });
        const json = (response.headers.get('content-type') ?? '').includes('application/json')
          ? await response.json() as { ok?: boolean; message?: string }
          : { ok: false, message: 'Не удалось сохранить настройку. Обновите страницу и попробуйте ещё раз.' };
        if (response.ok && json.ok === true) {
          setOk(true);
          setMessage(enabled
            ? 'Из кабинета этого автора теперь можно сразу создавать закрытые альбомы.'
            : 'Создание закрытых альбомов из кабинета для этого автора выключено.');
          router.refresh();
          return;
        }
        setOk(false);
        setMessage(typeof json.message === 'string' && json.message.trim()
          ? json.message.trim()
          : 'Не удалось сохранить настройку. Обновите страницу и попробуйте ещё раз.');
      } catch {
        setOk(false);
        setMessage('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5" data-closed-catalog-only-settings="">
      <div>
        <h2 className="text-[18px] font-semibold text-[#25135c]">{CLOSED_CATALOG_ONLY_TOGGLE_TITLE}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f5484]">{CLOSED_CATALOG_ONLY_TOGGLE_HINT}</p>
      </div>
      {authors.length === 0 ? (
        <p className="text-sm leading-6 text-[#7d70a2]">Для настройки нужен доступ владельца или редактора к автору.</p>
      ) : (
        <ul className="space-y-3">
          {authors.map((author) => {
            const enabled = isClosedCatalogOnlyAuthor(author.closedCatalogOnly);
            const busy = pending && pendingId === author.id;
            return (
              <li key={author.id} className="rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] px-4 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
                    checked={enabled}
                    disabled={pending}
                    onChange={(event) => toggle(author.id, event.target.checked)}
                    aria-label={`${CLOSED_CATALOG_ONLY_TOGGLE_LABEL}: ${author.name}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#25135c]">{author.name}</span>
                    <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                      {busy ? 'Сохраняю…' : enabled ? 'Включено – закрытые альбомы создаются из кабинета.' : 'Выключено.'}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p
        role={ok === false ? 'alert' : 'status'}
        className={message
          ? ok
            ? 'rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#5f5484]'
            : 'rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]'
          : undefined}
      >
        {message}
      </p>
    </section>
  );
}
