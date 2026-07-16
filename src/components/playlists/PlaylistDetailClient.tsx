"use client";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import PlaylistCover from "@/components/playlists/PlaylistCover";
import type { PlaylistDetailView } from "@/lib/playlists/detail";
import type { PlaylistVisibility } from "@/lib/playlists/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";

type PlaylistDetailClientProps = {
  detail: PlaylistDetailView;
};

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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function coverGradientForId(id: string): string {
  const gradients = [
    "from-[#f5d7e7] to-[#bd91df]",
    "from-[#d9c9f3] to-[#8f73cd]",
    "from-[#f4d6aa] to-[#d399c9]",
    "from-[#6870b7] to-[#c9b7ea]",
  ];
  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % gradients.length;
  }

  return gradients[hash] ?? gradients[0];
}

const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
const COVER_MAX_BYTES = 5 * 1024 * 1024;

export default function PlaylistDetailClient({
  detail,
}: PlaylistDetailClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(detail.items);
  const [coverUrl, setCoverUrl] = useState(detail.coverUrl);
  const [hasCustomCover, setHasCustomCover] = useState(
    Boolean(detail.coverUrl || detail.playlist.cover_path),
  );
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    practiceId: string;
    title: string;
  } | null>(null);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [coverMode, setCoverMode] = useState<"upload" | "replace" | "clear">(
    "upload",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [movingPracticeId, setMovingPracticeId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const coverTriggerRef = useRef<HTMLButtonElement | null>(null);
  const coverDialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const moveInFlightRef = useRef(false);
  const dialogTitleId = useId();
  const coverDialogTitleId = useId();

  const itemsCount = items.length;
  const hasUnavailable = items.some((item) => !item.available);
  const mosaicCoverUrls = items
    .slice(0, 4)
    .map((item) => item.coverDisplayUrl);
  const reorderBusy = movingPracticeId !== null || submitting;

  useEffect(() => {
    if (!menuId && !pendingDelete && !coverDialogOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuId(null);
        if (!submitting) {
          setPendingDelete(null);
          setFormError(null);
          if (!submitting) {
            setCoverDialogOpen(false);
            setSelectedFile(null);
            setCoverMode("upload");
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }
        }
      }
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;

      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuId(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [menuId, pendingDelete, coverDialogOpen, submitting]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!coverDialogOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trigger = coverTriggerRef.current;

    const focusables = coverDialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [coverDialogOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function closeCoverDialog() {
    if (submitting) {
      return;
    }

    setCoverDialogOpen(false);
    setSelectedFile(null);
    setFormError(null);
    setCoverMode("upload");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openCoverDialog() {
    setFormError(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setCoverMode(hasCustomCover ? "replace" : "upload");
    setCoverDialogOpen(true);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFormError(null);

    if (!file) {
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.type)) {
      setFormError("Можно загрузить изображение JPG, PNG или WebP.");
      setSelectedFile(null);
      return;
    }

    if (file.size > COVER_MAX_BYTES) {
      setFormError("Размер изображения не должен превышать 5 МБ.");
      setSelectedFile(null);
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function saveCover() {
    if (!selectedFile || submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const body = new FormData();
      body.append("file", selectedFile);

      const response = await fetch(
        `/api/playlists/${detail.playlist.id}/cover`,
        {
          method: "POST",
          body,
          credentials: "same-origin",
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        coverUrl?: string | null;
        message?: string;
      };

      if (!response.ok) {
        setFormError(
          data.message ||
            "Не удалось сохранить обложку. Попробуйте ещё раз.",
        );
        return;
      }

      setCoverUrl(data.coverUrl ?? null);
      setHasCustomCover(true);
      setCoverDialogOpen(false);
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setToast("Обложка сохранена.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setFormError("Не удалось сохранить обложку. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function clearCustomCover() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(
        `/api/playlists/${detail.playlist.id}/cover`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );

      if (!response.ok && response.status !== 204) {
        setFormError(
          "Не удалось вернуть автоматическую обложку. Попробуйте ещё раз.",
        );
        return;
      }

      setCoverUrl(null);
      setHasCustomCover(false);
      setCoverDialogOpen(false);
      setToast("Возвращена автоматическая обложка.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setFormError(
        "Не удалось вернуть автоматическую обложку. Попробуйте ещё раз.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || submitting || moveInFlightRef.current) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(
        `/api/playlists/${detail.playlist.id}/items/${pendingDelete.practiceId}`,
        { method: "DELETE", credentials: "same-origin" },
      );

      if (!response.ok && response.status !== 404) {
        setFormError("Не удалось удалить материал. Попробуйте ещё раз.");
        return;
      }

      setItems((current) =>
        current.filter((item) => item.practiceId !== pendingDelete.practiceId),
      );
      setPendingDelete(null);
      setMenuId(null);
      setToast("Материал удалён из плейлиста.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setFormError("Не удалось удалить материал. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function moveItem(
    practiceId: string,
    direction: "up" | "down",
  ) {
    if (moveInFlightRef.current || submitting) {
      return;
    }

    moveInFlightRef.current = true;
    setMovingPracticeId(practiceId);
    setListError(null);
    setMenuId(null);

    try {
      const response = await fetch(
        `/api/playlists/${detail.playlist.id}/items/${practiceId}/move`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        moved?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        if (response.status === 404) {
          setListError("Материал не найден в этом плейлисте.");
        } else if (response.status === 409) {
          setListError(
            data.message ||
              "Порядок уже изменился. Обновите страницу и попробуйте ещё раз.",
          );
        } else {
          setListError(
            data.message ||
              "Не удалось изменить порядок. Попробуйте ещё раз.",
          );
        }
        return;
      }

      if (data.moved) {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch {
      setListError("Не удалось изменить порядок. Попробуйте ещё раз.");
    } finally {
      moveInFlightRef.current = false;
      setMovingPracticeId(null);
    }
  }

  return (
    <>
      <Link
        href="/playlists"
        className="inline-flex text-sm font-medium text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        ← Плейлисты
      </Link>

      <header className="mt-5 flex gap-4">
        <div className="relative h-[112px] w-[112px] shrink-0">
          <PlaylistCover
            title={detail.playlist.title}
            customCoverUrl={coverUrl}
            mosaicCoverUrls={mosaicCoverUrls}
            gradientClassName={`bg-gradient-to-br ${coverGradientForId(detail.playlist.id)}`}
            className="h-full w-full rounded-[22px]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold leading-8">
            {detail.playlist.title}
          </h1>
          <p className="mt-2 text-sm text-[#7d70a2]">
            {visibilityLabel(detail.playlist.visibility)}
          </p>
          <p className="mt-1 text-sm text-[#7d70a2]">
            {formatItemsCount(itemsCount)}
            {detail.totalDurationLabel
              ? ` · ${detail.totalDurationLabel}`
              : ""}
          </p>
          <button
            ref={coverTriggerRef}
            type="button"
            className="mt-3 text-sm font-medium text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            onClick={openCoverDialog}
          >
            Изменить обложку
          </button>
        </div>
      </header>

      {hasUnavailable ? (
        <p className="mt-5 rounded-[18px] border border-[#f0e0c8] bg-[#fff8ee] px-4 py-3 text-sm text-[#8a6a3d]">
          Некоторые материалы сейчас недоступны.
        </p>
      ) : null}

      {itemsCount === 0 ? (
        <section className="mt-8 rounded-[24px] border border-dashed border-[#ddcfef] bg-white px-5 py-8 text-center">
          <p className="text-[18px] font-semibold">В этом плейлисте пока пусто</p>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Добавьте материалы из Аудиотеки.
          </p>
          <Link
            href="/my-practices"
            className="mt-6 inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
          >
            Перейти в Аудиотеку
          </Link>
        </section>
      ) : (
        <section className="mt-7 space-y-3">
          {listError ? (
            <p className="rounded-[18px] border border-[#f0d0d8] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]" role="alert">
              {listError}
            </p>
          ) : null}
          {items.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === items.length - 1;
            const rowMoving = movingPracticeId === item.practiceId;

            return (
            <article
              key={item.practiceId}
              className="flex gap-3 rounded-[22px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.05)]"
            >
              <div className="flex w-7 shrink-0 items-start justify-center pt-3 text-sm font-medium text-[#8f82ad]">
                {index + 1}
              </div>

              <div className="h-[84px] w-[84px] shrink-0">
                <ProductCoverThumbnail
                  slug={item.practiceId}
                  title={item.title}
                  coverUrl={item.coverDisplayUrl}
                  className="h-full w-full rounded-[18px]"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-[16px] font-semibold leading-5">
                  {item.title}
                </p>
                {item.authorName ? (
                  <p className="mt-1 truncate text-sm text-[#25135c]">
                    {item.authorName}
                  </p>
                ) : null}
                {item.metaLabel ? (
                  <p className="mt-1 text-xs text-[#7d70a2]">{item.metaLabel}</p>
                ) : null}
                {!item.available ? (
                  <p className="mt-1 text-xs text-[#b34f63]">
                    Материал сейчас недоступен
                  </p>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  {item.listenHref ? (
                    <Link
                      href={item.listenHref}
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#7042c5]"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7042c5] text-white">
                        <PlayIcon />
                      </span>
                      Слушать
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#7042c5] opacity-50"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7042c5] text-white">
                        <PlayIcon />
                      </span>
                      Слушать
                    </button>
                  )}

                  <div className="flex shrink-0 items-center gap-1">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Переместить выше: ${item.title}`}
                        disabled={isFirst || reorderBusy}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-[#7042c5] disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                        onClick={() => void moveItem(item.practiceId, "up")}
                      >
                        {rowMoving ? "…" : "↑"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Переместить ниже: ${item.title}`}
                        disabled={isLast || reorderBusy}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-[#7042c5] disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                        onClick={() => void moveItem(item.practiceId, "down")}
                      >
                        ↓
                      </button>
                    </div>

                    <div
                      className="relative"
                      ref={menuId === item.practiceId ? menuRef : null}
                    >
                      <button
                        type="button"
                        aria-label={`Меню материала ${item.title}`}
                        aria-expanded={menuId === item.practiceId}
                        aria-haspopup="menu"
                        disabled={reorderBusy}
                        className="flex h-10 w-10 items-center justify-center text-2xl leading-none text-[#8f82ad] disabled:opacity-40"
                        onClick={() =>
                          setMenuId((current) =>
                            current === item.practiceId ? null : item.practiceId,
                          )
                        }
                      >
                        ···
                      </button>

                      {menuId === item.practiceId ? (
                        <div
                          role="menu"
                          className="absolute bottom-full right-0 z-20 mb-2 min-w-[200px] overflow-hidden rounded-[16px] border border-[#eadff8] bg-white shadow-[0_12px_28px_rgba(91,62,145,0.16)]"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-4 py-3 text-left text-sm text-[#b34f63] hover:bg-[#fff8f9]"
                            onClick={() => {
                              setMenuId(null);
                              setFormError(null);
                              setPendingDelete({
                                practiceId: item.practiceId,
                                title: item.title,
                              });
                            }}
                          >
                            Удалить из плейлиста
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </article>
            );
          })}
        </section>
      )}

      {coverDialogOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[#25135c]/35 px-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) {
              closeCoverDialog();
            }
          }}
        >
          <div
            ref={coverDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={coverDialogTitleId}
            className="w-full max-w-[430px] rounded-t-[28px] border border-[#eadff8] bg-white p-5 shadow-[0_-12px_40px_rgba(91,62,145,0.18)] sm:rounded-[28px]"
          >
            <h2 id={coverDialogTitleId} className="text-[20px] font-semibold">
              {hasCustomCover ? "Изменить обложку" : "Загрузить обложку"}
            </h2>
            <p className="mt-2 text-sm text-[#7d70a2]">
              JPG, PNG или WebP, до 5 МБ
            </p>

            <div className="mt-4 flex gap-4">
              <div className="h-28 w-28 overflow-hidden rounded-[20px] border border-[#eadff8]">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Предпросмотр обложки"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <PlaylistCover
                    title={detail.playlist.title}
                    customCoverUrl={coverUrl}
                    mosaicCoverUrls={mosaicCoverUrls}
                    gradientClassName={`bg-gradient-to-br ${coverGradientForId(detail.playlist.id)}`}
                    className="h-full w-full"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={COVER_ACCEPT}
                  className="sr-only"
                  id="playlist-cover-file"
                  onChange={onFileChange}
                />
                <label
                  htmlFor="playlist-cover-file"
                  className="inline-flex cursor-pointer rounded-full border border-[#ddcfef] px-4 py-2 text-sm font-medium text-[#7042c5]"
                >
                  {hasCustomCover
                    ? "Заменить изображение"
                    : "Загрузить изображение"}
                </label>
                {selectedFile ? (
                  <p className="mt-2 truncate text-xs text-[#7d70a2]">
                    {selectedFile.name}
                  </p>
                ) : null}
                {hasCustomCover ? (
                  <button
                    type="button"
                    className="mt-3 block text-sm text-[#b34f63]"
                    disabled={submitting}
                    onClick={() => {
                      setCoverMode("clear");
                      void clearCustomCover();
                    }}
                  >
                    Вернуть автоматическую обложку
                  </button>
                ) : null}
              </div>
            </div>

            {formError ? (
              <p className="mt-3 text-sm text-[#b34f63]" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full border border-[#ddcfef] px-4 py-3 text-sm"
                disabled={submitting}
                onClick={closeCoverDialog}
              >
                Отмена
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-[#7042c5] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                disabled={submitting || !selectedFile || coverMode === "clear"}
                onClick={() => void saveCover()}
              >
                {submitting ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[#25135c]/35 px-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) {
              setPendingDelete(null);
              setFormError(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full max-w-[430px] rounded-t-[28px] border border-[#eadff8] bg-white p-5 shadow-[0_-12px_40px_rgba(91,62,145,0.18)] sm:rounded-[28px]"
          >
            <h2 id={dialogTitleId} className="text-[20px] font-semibold">
              Удалить «{pendingDelete.title}» из плейлиста?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Материал останется в вашей Аудиотеке.
            </p>
            {formError ? (
              <p className="mt-3 text-sm text-[#b34f63]" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full border border-[#ddcfef] px-4 py-3 text-sm"
                disabled={submitting}
                onClick={() => {
                  setPendingDelete(null);
                  setFormError(null);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-[#b34f63] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                disabled={submitting}
                onClick={() => void confirmDelete()}
              >
                {submitting ? "Удаление…" : "Удалить"}
              </button>
            </div>
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
