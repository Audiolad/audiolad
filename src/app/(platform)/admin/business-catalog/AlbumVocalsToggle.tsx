'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SET_ALBUM_VOCALS_ROUTE, VOCAL_ALBUM_LABEL } from '@/lib/business-catalog/vocals';

const secondaryButtonClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';
const dangerButtonClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#ebc9c9] px-4 py-2 text-sm font-semibold text-[#9b3d3d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b3d3d] disabled:opacity-60';

export default function AlbumVocalsToggle({
  albumId,
  albumTitle,
  hasVocals,
}: {
  albumId: string;
  albumTitle: string;
  hasVocals: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const next = !hasVocals;
  const prompt = next
    ? `Пометить альбом «${albumTitle}» как «${VOCAL_ALBUM_LABEL}»? Метка встанет на все его треки.`
    : `Снять метку «${VOCAL_ALBUM_LABEL}» с альбома «${albumTitle}»? Все его треки станут без вокала.`;

  return (
    <div className="space-y-2" data-album-vocals-toggle={hasVocals ? 'on' : 'off'}>
      {confirm ? (
        <div className="rounded-[18px] border border-[#eadff8] bg-[#fbf8ff] p-3">
          <p className="text-sm leading-6 text-[#5f5484]">{prompt}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={secondaryButtonClassName}
              onClick={() => start(async () => {
                setMessage('');
                try {
                  const response = await fetch(SET_ALBUM_VOCALS_ROUTE, {
                    method: 'POST',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ album_id: albumId, has_vocals: next }),
                  });
                  const body = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
                  if (!response.ok || body.ok !== true) {
                    setMessage(typeof body.message === 'string' && body.message.trim()
                      ? body.message
                      : 'Не удалось изменить метку «С вокалом». Обновите страницу и попробуйте ещё раз.');
                    return;
                  }
                  setConfirm(false);
                  router.refresh();
                } catch {
                  setMessage('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
                }
              })}
            >
              {pending ? 'Сохраняю…' : 'Подтвердить'}
            </button>
            <button type="button" disabled={pending} className={dangerButtonClassName} onClick={() => setConfirm(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={pending} className={secondaryButtonClassName} onClick={() => { setMessage(''); setConfirm(true); }}>
          {hasVocals ? 'Снять метку «С вокалом»' : 'Пометить «С вокалом»'}
        </button>
      )}
      {message ? <p role="alert" className="text-sm leading-6 text-[#9b3d3d]">{message}</p> : null}
    </div>
  );
}
