'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CREATE_CLOSED_ALBUM_CABINET_BUTTON,
  CREATE_CLOSED_ALBUM_CABINET_HINT,
  CREATE_CLOSED_ALBUM_CABINET_ROUTE,
  CREATE_CLOSED_ALBUM_CABINET_TITLE,
} from '@/lib/authors/closed-catalog-only';
import {
  parseCreateClosedAlbumResponse,
  type CreateClosedAlbumResult,
} from '@/lib/business-track-passports/create-album';

const fieldClassName =
  'block w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#fbf8ff] disabled:text-[#7d70a2]';
const primaryButtonClassName =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60';

export default function CreateClosedAlbumCabinet({
  authorId,
  authorName,
  disabled = false,
}: {
  authorId: string;
  authorName?: string;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      data-closed-album-cabinet-create=""
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || disabled) return;
        const form = new FormData(event.currentTarget);
        setMessage('');
        setOk(null);
        start(async () => {
          let result: CreateClosedAlbumResult;
          try {
            const response = await fetch(CREATE_CLOSED_ALBUM_CABINET_ROUTE, {
              method: 'POST',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                author_id: authorId,
                title: String(form.get('title') ?? ''),
              }),
            });
            result = parseCreateClosedAlbumResponse({
              status: response.status,
              redirected: response.redirected,
              contentType: response.headers.get('content-type'),
              body: await response.text(),
            });
          } catch {
            result = { ok: false, message: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.' };
          }
          if (result.ok) {
            setOk(true);
            setMessage(result.reused ? 'Такой альбом уже создан – открываю его.' : 'Альбом создан – открываю его.');
            router.push(result.editHref);
            return;
          }
          setOk(false);
          setMessage(result.message);
        });
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-[18px] font-semibold text-[#25135c]">{CREATE_CLOSED_ALBUM_CABINET_TITLE}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f5484]">{CREATE_CLOSED_ALBUM_CABINET_HINT}</p>
        {authorName ? (
          <p className="mt-2 text-sm text-[#7d70a2]">Автор: {authorName}</p>
        ) : null}
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-[#25135c]">Название</span>
        <input name="title" required maxLength={300} placeholder="Название альбома" disabled={pending || disabled} className={fieldClassName} />
      </label>
      <div>
        <button type="submit" disabled={pending || disabled} className={primaryButtonClassName}>
          {pending ? 'Создаю альбом…' : CREATE_CLOSED_ALBUM_CABINET_BUTTON}
        </button>
      </div>
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
    </form>
  );
}
