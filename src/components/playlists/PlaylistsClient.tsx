"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import PlaylistCover from "@/components/playlists/PlaylistCover";
import {
  buildPublicPlaylistCanonicalUrl,
  copyTextToClipboard,
} from "@/lib/playlists/public-url";
import {
  PLAYLIST_MAX_PER_USER,
  PLAYLIST_TITLE_MAX_LENGTH,
  type PlaylistListItem,
  type PlaylistVisibility,
} from "@/lib/playlists/types";

type PlaylistsClientProps = {
  playlists: PlaylistListItem[];
  loadError: boolean;
};

type DialogMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "rename"; playlist: PlaylistListItem }
  | { type: "visibility"; playlist: PlaylistListItem; next: PlaylistVisibility }
  | { type: "delete"; playlist: PlaylistListItem };

const COVER_GRADIENTS = [
  "from-[#f5d7e7] to-[#bd91df]",
  "from-[#d9c9f3] to-[#8f73cd]",
  "from-[#f4d6aa] to-[#d399c9]",
  "from-[#6870b7] to-[#c9b7ea]",
  "from-[#f0bcd1] to-[#af7ed2]",
  "from-[#6f69b5] to-[#d6c4ee]",
];

function coverGradientForId(id: string): string {
  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % COVER_GRADIENTS.length;
  }

  return COVER_GRADIENTS[hash] ?? COVER_GRADIENTS[0];
}

function visibilityLabel(visibility: PlaylistVisibility): string {
  return visibility === "public" ? "Доступен всем" : "Только для меня";
}

function formatItemsCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} материал`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} материала`;
  }

  return `${count} материалов`;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string;
      message?: string;
    };

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }

    if (data.error === "limit_reached") {
      return "Можно создать не больше 50 плейлистов.";
    }

    if (data.error === "public_content_invalid") {
      return "Чтобы сделать плейлист публичным, оставьте в нём только бесплатные материалы, доступные всем.";
    }

    if (data.error === "unauthorized") {
      return "Нужно войти в аккаунт.";
    }

    if (data.error === "not_found") {
      return "Плейлист не найден.";
    }

    if (data.error === "slug_conflict") {
      return "Не удалось подобрать уникальную ссылку. Попробуйте ещё раз.";
    }
  } catch {
    // ignore JSON parse errors
  }

  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PlaylistsClient({
  playlists,
  loadError,
}: PlaylistsClientProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogMode>({ type: "closed" });
  const [menuId, setMenuId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<PlaylistVisibility>("private");
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const titleInputId = useId();

  const atLimit = playlists.length >= PLAYLIST_MAX_PER_USER;
  const busy = submitting || isPending;

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function copyPublicLink(playlist: PlaylistListItem) {
    if (playlist.visibility !== "public" || !playlist.slug) {
      return;
    }

    setMenuId(null);
    const url = buildPublicPlaylistCanonicalUrl(playlist.slug);
    const ok = await copyTextToClipboard(url);
    setToast(ok ? "Ссылка скопирована." : "Не удалось скопировать ссылку.");
  }

  useEffect(() => {
    if (dialog.type === "closed" && !menuId) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuId(null);
        if (!busy) {
          setDialog({ type: "closed" });
          setFormError(null);
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog.type, menuId, busy]);

  useEffect(() => {
    if (!menuId) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;

      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuId(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [menuId]);

  function openCreate() {
    setMenuId(null);
    setTitle("");
    setVisibility("private");
    setFormError(null);
    setDialog({ type: "create" });
  }

  function openRename(playlist: PlaylistListItem) {
    setMenuId(null);
    setTitle(playlist.title);
    setFormError(null);
    setDialog({ type: "rename", playlist });
  }

  function openVisibility(
    playlist: PlaylistListItem,
    next: PlaylistVisibility,
  ) {
    setMenuId(null);
    setFormError(null);
    setDialog({ type: "visibility", playlist, next });
  }

  function openDelete(playlist: PlaylistListItem) {
    setMenuId(null);
    setFormError(null);
    setDialog({ type: "delete", playlist });
  }

  function closeDialog() {
    if (busy) {
      return;
    }

    setDialog({ type: "closed" });
    setFormError(null);
  }

  function refreshList() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function submitCreate() {
    if (busy) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, visibility }),
      });

      if (!response.ok) {
        setFormError(await readApiError(response));
        return;
      }

      setDialog({ type: "closed" });
      refreshList();
    } catch {
      setFormError("Не удалось выполнить действие. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRename(playlistId: string) {
    if (busy) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        setFormError(await readApiError(response));
        return;
      }

      setDialog({ type: "closed" });
      refreshList();
    } catch {
      setFormError("Не удалось выполнить действие. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitVisibility(
    playlistId: string,
    next: PlaylistVisibility,
  ) {
    if (busy) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });

      if (!response.ok) {
        setFormError(await readApiError(response));
        return;
      }

      setDialog({ type: "closed" });
      refreshList();
    } catch {
      setFormError("Не удалось выполнить действие. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDelete(playlistId: string) {
    if (busy) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setFormError(await readApiError(response));
        return;
      }

      setDialog({ type: "closed" });
      refreshList();
    } catch {
      setFormError("Не удалось выполнить действие. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold">Плейлисты</h1>
          <p className="mt-1 text-sm text-[#7d70a2]">
            Ваши подборки для разных состояний
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          disabled={atLimit || loadError}
          aria-label="Создать плейлист"
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon />
          Создать
        </button>
      </header>

      {atLimit && !loadError ? (
        <p className="mt-4 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#70628e]">
          Можно создать не больше 50 плейлистов.
        </p>
      ) : null}

      {loadError ? (
        <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
          <p className="text-[16px] font-medium">
            Не удалось загрузить плейлисты. Попробуйте ещё раз.
          </p>
          <button
            type="button"
            onClick={() => refreshList()}
            className="mt-5 rounded-full border border-[#bda6e1] px-5 py-2.5 text-sm font-medium text-[#7042c5]"
          >
            Обновить
          </button>
        </section>
      ) : null}

      {!loadError && playlists.length === 0 ? (
        <section className="mt-8 rounded-[24px] border border-dashed border-[#d4c2eb] bg-[#faf6ff] px-5 py-10 text-center">
          <p className="text-[18px] font-semibold">Пока нет плейлистов</p>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Создайте свою подборку из материалов Аудиотеки.
          </p>
          <button
            type="button"
            onClick={openCreate}
            disabled={atLimit}
            className="mt-6 inline-flex items-center gap-2 rounded-[20px] bg-[#7042c5] px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            <PlusIcon />
            Создать плейлист
          </button>
        </section>
      ) : null}

      {!loadError && playlists.length > 0 ? (
        <section className="mt-7">
          <h2 className="text-[21px] font-semibold">Мои плейлисты</h2>

          <div className="mt-5 space-y-5">
            {playlists.map((playlist) => (
              <article
                key={playlist.id}
                className="rounded-[26px] border border-[#eadff8] bg-white p-4 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
              >
                <div className="flex gap-4">
                  <Link
                    href={`/playlists/${playlist.id}`}
                    className="block h-[118px] w-[118px] shrink-0 overflow-hidden rounded-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                    aria-label={`Открыть плейлист ${playlist.title}`}
                  >
                    <PlaylistCover
                      title={playlist.title}
                      customCoverUrl={playlist.coverUrl}
                      mosaicCoverUrls={playlist.mosaicCoverUrls}
                      gradientClassName={`bg-gradient-to-br ${coverGradientForId(playlist.id)}`}
                      className="h-full w-full rounded-[22px]"
                    />
                  </Link>

                  <div className="relative flex min-w-0 flex-1 flex-col">
                    <Link
                      href={`/playlists/${playlist.id}`}
                      className="min-w-0 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                    >
                      <p className="text-[18px] font-semibold leading-6">
                        {playlist.title}
                      </p>
                      <p className="mt-1 text-sm text-[#7d70a2]">
                        {visibilityLabel(playlist.visibility)}
                      </p>
                      <p className="mt-1 text-sm text-[#7d70a2]">
                        {formatItemsCount(playlist.items_count)}
                      </p>
                    </Link>

                    <div className="mt-auto flex items-center justify-end pt-3">
                      <div className="relative" ref={menuId === playlist.id ? menuRef : null}>
                        <button
                          type="button"
                          aria-label={`Меню плейлиста ${playlist.title}`}
                          aria-expanded={menuId === playlist.id}
                          aria-haspopup="menu"
                          onClick={() =>
                            setMenuId((current) =>
                              current === playlist.id ? null : playlist.id,
                            )
                          }
                          className="px-2 text-2xl leading-none text-[#8f82ad]"
                        >
                          ···
                        </button>

                        {menuId === playlist.id ? (
                          <div
                            role="menu"
                            className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-[18px] border border-[#eadff8] bg-white py-1 shadow-[0_16px_40px_rgba(91,62,145,0.16)]"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="block w-full px-4 py-3 text-left text-sm text-[#25135c] hover:bg-[#faf6ff]"
                              onClick={() => openRename(playlist)}
                            >
                              Переименовать
                            </button>
                            {playlist.visibility === "private" ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-4 py-3 text-left text-sm text-[#25135c] hover:bg-[#faf6ff]"
                                onClick={() =>
                                  openVisibility(playlist, "public")
                                }
                              >
                                Сделать доступным всем
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-4 py-3 text-left text-sm text-[#25135c] hover:bg-[#faf6ff]"
                                onClick={() =>
                                  openVisibility(playlist, "private")
                                }
                              >
                                Сделать приватным
                              </button>
                            )}
                            {playlist.visibility === "public" &&
                            playlist.slug ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-4 py-3 text-left text-sm text-[#25135c] hover:bg-[#faf6ff]"
                                onClick={() => void copyPublicLink(playlist)}
                              >
                                Скопировать ссылку
                              </button>
                            ) : null}
                            <button
                              type="button"
                              role="menuitem"
                              className="block w-full px-4 py-3 text-left text-sm text-[#b34f63] hover:bg-[#fff8f9]"
                              onClick={() => openDelete(playlist)}
                            >
                              Удалить
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {dialog.type !== "closed" ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[#25135c]/35 px-0 sm:items-center sm:px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="playlist-dialog-title"
            className="w-full max-w-[430px] rounded-t-[28px] border border-[#eadff8] bg-white p-5 shadow-[0_-12px_40px_rgba(91,62,145,0.18)] sm:rounded-[28px]"
          >
            {dialog.type === "create" || dialog.type === "rename" ? (
              <>
                <h2
                  id="playlist-dialog-title"
                  className="text-[22px] font-semibold"
                >
                  {dialog.type === "create"
                    ? "Новый плейлист"
                    : "Переименовать"}
                </h2>

                <label className="mt-5 block" htmlFor={titleInputId}>
                  <span className="text-sm font-medium">Название</span>
                  <input
                    id={titleInputId}
                    type="text"
                    value={title}
                    maxLength={PLAYLIST_TITLE_MAX_LENGTH}
                    onChange={(event) => setTitle(event.target.value)}
                    className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]"
                    placeholder="Например, Утро в ресурсе"
                    autoFocus
                  />
                  <span className="mt-2 block text-right text-xs text-[#8a7ca9]">
                    {title.trim().length}/{PLAYLIST_TITLE_MAX_LENGTH}
                  </span>
                </label>

                {dialog.type === "create" ? (
                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium">Кто видит</legend>
                    <div className="mt-3 space-y-2">
                      <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#eadff8] px-4 py-3">
                        <input
                          type="radio"
                          name="playlist-visibility"
                          checked={visibility === "private"}
                          onChange={() => setVisibility("private")}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium">
                            Только для меня
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-[#7d70a2]">
                            Этот плейлист будете видеть только вы.
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#eadff8] px-4 py-3">
                        <input
                          type="radio"
                          name="playlist-visibility"
                          checked={visibility === "public"}
                          onChange={() => setVisibility("public")}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium">
                            Доступен всем
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-[#7d70a2]">
                            Плейлист смогут открыть все. В него можно добавлять
                            только бесплатные общедоступные материалы.
                          </span>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                ) : null}

                {formError ? (
                  <p className="mt-4 text-sm text-[#b34f63]">{formError}</p>
                ) : null}

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={busy}
                    className="rounded-[18px] border border-[#ddcfef] px-4 py-3 font-medium text-[#7042c5] disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={busy || title.trim().length < 1}
                    onClick={() => {
                      if (dialog.type === "create") {
                        void submitCreate();
                      } else {
                        void submitRename(dialog.playlist.id);
                      }
                    }}
                    className="rounded-[18px] bg-[#7042c5] px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {busy
                      ? "Сохранение…"
                      : dialog.type === "create"
                        ? "Создать"
                        : "Сохранить"}
                  </button>
                </div>
              </>
            ) : null}

            {dialog.type === "visibility" ? (
              <>
                <h2
                  id="playlist-dialog-title"
                  className="text-[22px] font-semibold"
                >
                  {dialog.next === "public"
                    ? "Сделать доступным всем?"
                    : "Сделать приватным?"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#70628e]">
                  {dialog.next === "public"
                    ? "Плейлист станет доступен всем по публичной ссылке. В публичном плейлисте могут находиться только бесплатные общедоступные материалы."
                    : "Плейлист перестанет быть доступен другим пользователям. Продолжить?"}
                </p>
                {formError ? (
                  <p className="mt-4 text-sm text-[#b34f63]">{formError}</p>
                ) : null}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={busy}
                    className="rounded-[18px] border border-[#ddcfef] px-4 py-3 font-medium text-[#7042c5] disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void submitVisibility(dialog.playlist.id, dialog.next)
                    }
                    className="rounded-[18px] bg-[#7042c5] px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Сохранение…" : "Продолжить"}
                  </button>
                </div>
              </>
            ) : null}

            {dialog.type === "delete" ? (
              <>
                <h2
                  id="playlist-dialog-title"
                  className="text-[22px] font-semibold"
                >
                  Удалить плейлист «{dialog.playlist.title}»?
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#70628e]">
                  Это действие нельзя отменить.
                </p>
                {formError ? (
                  <p className="mt-4 text-sm text-[#b34f63]">{formError}</p>
                ) : null}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={busy}
                    className="rounded-[18px] border border-[#ddcfef] px-4 py-3 font-medium text-[#7042c5] disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submitDelete(dialog.playlist.id)}
                    className="rounded-[18px] bg-[#b34f63] px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Удаление…" : "Удалить"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
          role="status"
        >
          <p className="rounded-full bg-[#25135c] px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </>
  );
}
