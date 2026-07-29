"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";
import PrivateAudioGlobalPlayerControls from "@/components/private-audio/PrivateAudioGlobalPlayerControls";
import { isPrivateAudioSession } from "@/lib/listen/global-player-types";
import {
  deletePrivateAudioCoverRequest,
  deletePrivateAudioItemRequest,
  updatePrivateAudioItemRequest,
  uploadPrivateAudioCoverRequest,
} from "@/lib/private-audio/client/api";
import {
  formatPrivateDuration,
  getPrivateProgressLabel,
} from "@/lib/private-audio/mappers";
import { getPrivateAudioErrorMessage } from "@/lib/private-audio/error-messages";
import { PRIVATE_AUDIO_LIMITS } from "@/lib/private-audio/limits";
import type { PrivateAudioDetailDto } from "@/lib/private-audio/types";

type PrivateAudioDetailClientProps = {
  item: PrivateAudioDetailDto;
};

export default function PrivateAudioDetailClient({
  item: initialItem,
}: PrivateAudioDetailClientProps) {
  const router = useRouter();
  const { session, stopAndClear } = useGlobalAudioPlayer();
  const [item, setItem] = useState(initialItem);
  const [title, setTitle] = useState(initialItem.title);
  const [authorText, setAuthorText] = useState(initialItem.authorText ?? "");
  const [progressLabel, setProgressLabel] = useState(
    getPrivateProgressLabel(initialItem.progress),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleProgressLabelChange = useCallback(
    (input: {
      positionSeconds: number;
      durationSeconds: number;
      completed: boolean;
    }) => {
      setProgressLabel(
        getPrivateProgressLabel({
          positionSeconds: input.positionSeconds,
          durationSeconds:
            input.durationSeconds || item.progress.durationSeconds,
          completed: input.completed,
          updatedAt: null,
        }),
      );
    },
    [item.progress.durationSeconds],
  );

  async function handleSaveMetadata() {
    setBusy(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const updated = await updatePrivateAudioItemRequest(item.id, {
        title,
        authorText,
      });
      setItem(updated);
      setMessage("Изменения сохранены.");
      router.refresh();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "internal_error";
      setErrorMessage(getPrivateAudioErrorMessage(code));
    } finally {
      setBusy(false);
    }
  }

  async function handleCoverChange(file: File | null) {
    if (!file) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const updated = await uploadPrivateAudioCoverRequest(item.id, file);
      setItem(updated);
      setMessage("Обложка обновлена.");
      router.refresh();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "internal_error";
      setErrorMessage(getPrivateAudioErrorMessage(code));
    } finally {
      setBusy(false);
    }
  }

  async function handleCoverDelete() {
    setBusy(true);
    setErrorMessage(null);

    try {
      const updated = await deletePrivateAudioCoverRequest(item.id);
      setItem(updated);
      setMessage("Обложка удалена.");
      router.refresh();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "internal_error";
      setErrorMessage(getPrivateAudioErrorMessage(code));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setErrorMessage(null);

    const isCurrentlyPlaying =
      Boolean(session) &&
      isPrivateAudioSession(session!) &&
      session!.itemId === item.id;

    try {
      // Stop global session before hard-delete so signed URL / audio src are cleared.
      if (isCurrentlyPlaying) {
        stopAndClear();
      }

      await deletePrivateAudioItemRequest(item.id);
      router.push("/my-practices?filter=uploads");
      router.refresh();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "internal_error";
      setErrorMessage(getPrivateAudioErrorMessage(code));
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const durationLabel = formatPrivateDuration(item.durationSeconds);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/my-practices?filter=uploads"
          className="text-sm font-medium text-[#7042c5]"
        >
          ← Мои загрузки
        </Link>
      </div>

      <header className="flex gap-4">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[22px] bg-[#f4eefc]">
          {item.coverUrl ? (
            <Image
              src={item.coverUrl}
              alt=""
              fill
              unoptimized
              className="object-cover"
              sizes="112px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-[#7042c5]">
              {item.title.trim().charAt(0).toUpperCase() || "А"}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[#7042c5]">
            Только для вас
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[#25135c]">
            {item.title}
          </h1>
          {item.authorText ? (
            <p className="mt-1 text-sm text-[#7d70a2]">{item.authorText}</p>
          ) : null}
          <p className="mt-2 text-sm text-[#7d70a2]">
            {[durationLabel, progressLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      <PrivateAudioGlobalPlayerControls
        item={item}
        onProgressLabelChange={handleProgressLabelChange}
      />

      <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Изменить</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="edit-title"
              className="block text-sm font-medium text-[#25135c]"
            >
              Название
            </label>
            <input
              id="edit-title"
              value={title}
              maxLength={PRIVATE_AUDIO_LIMITS.titleMaxLength}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-[16px] border border-[#e2d7f2] px-4 py-3 text-[16px] outline-none focus:border-[#7042c5]"
            />
          </div>
          <div>
            <label
              htmlFor="edit-author"
              className="block text-sm font-medium text-[#25135c]"
            >
              Автор или источник
            </label>
            <input
              id="edit-author"
              value={authorText}
              maxLength={PRIVATE_AUDIO_LIMITS.authorTextMaxLength}
              disabled={busy}
              onChange={(event) => setAuthorText(event.target.value)}
              className="mt-2 w-full rounded-[16px] border border-[#e2d7f2] px-4 py-3 text-[16px] outline-none focus:border-[#7042c5]"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSaveMetadata()}
            className="inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Сохранить
          </button>
        </div>

        <div className="mt-6 border-t border-[#eadff8] pt-5">
          <p className="text-sm font-medium text-[#25135c]">Обложка</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[16px] border border-[#d9c7f4] px-4 text-sm font-semibold text-[#7042c5]">
              {item.hasCover ? "Заменить обложку" : "Загрузить обложку"}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  void handleCoverChange(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
            {item.hasCover ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCoverDelete()}
                className="inline-flex min-h-11 items-center justify-center rounded-[16px] border border-[#eadff8] px-4 text-sm font-semibold text-[#5f5484] disabled:opacity-60"
              >
                Удалить обложку
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#f3d4d4] bg-[#fff8f8] p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Удаление</h2>
        <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
          Аудиофайл, обложка и сохранённый прогресс будут удалены без
          возможности восстановления.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#d64545] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Удалить аудиоматериал
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-[#25135c]">
              Удалить аудиоматериал?
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete()}
                className="inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#d64545] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Да, удалить
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-[16px] border border-[#eadff8] bg-white px-4 text-sm font-semibold text-[#5f5484]"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </section>

      {message ? (
        <p className="text-sm text-[#3f8f5b]" role="status">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="text-sm text-[#d64545]" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
