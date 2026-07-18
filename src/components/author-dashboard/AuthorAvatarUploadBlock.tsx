"use client";

import { useCallback, useState } from "react";

import { useAvatarCropUpload } from "@/components/images/useAvatarCropUpload";
import { AVATAR_ERROR_MESSAGES, AVATAR_UPLOAD_HINT } from "@/lib/images/avatar-constants";

type AuthorAvatarUploadBlockProps = {
  authorId: string;
  avatarUrl: string | null;
  disabled?: boolean;
  onUpdated: (url: string | null) => void;
};

export default function AuthorAvatarUploadBlock({
  authorId,
  avatarUrl,
  disabled = false,
  onUpdated,
}: AuthorAvatarUploadBlockProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const uploadAvatar = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.set("author_id", authorId);
      formData.set("file", file);

      try {
        const response = await fetch("/api/author/profile/avatar", {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json().catch(() => null)) as
          | { url?: string | null; message?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload?.message ?? AVATAR_ERROR_MESSAGES.saveFailed,
          );
        }

        onUpdated(payload?.url ?? null);
      } finally {
        setUploading(false);
      }
    },
    [authorId, onUpdated],
  );

  const {
    fileInputRef,
    error: cropError,
    openPicker,
    handleFileChange,
    cropper,
    isSavingCrop,
  } = useAvatarCropUpload({
    disabled: disabled || uploading || deleting,
    onUpload: uploadAvatar,
  });

  const deleteAvatar = useCallback(async () => {
    if (disabled || uploading || deleting || !avatarUrl) {
      return;
    }

    if (!window.confirm("Удалить фото?")) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/author/profile/avatar?author_id=${encodeURIComponent(authorId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("delete_failed");
      }

      onUpdated(null);
    } catch {
      setError("Не удалось удалить изображение.");
    } finally {
      setDeleting(false);
    }
  }, [authorId, avatarUrl, deleting, disabled, onUpdated, uploading]);

  const isBusy = uploading || deleting || isSavingCrop;
  const displayError = error ?? cropError;
  const showPreview = Boolean(avatarUrl?.trim()) && !previewFailed;

  return (
    <div>
      {cropper}

      <span className="mb-2 block text-sm font-medium">Фотография или логотип</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || isBusy}
          className="group relative block h-28 w-28 overflow-hidden rounded-[18px] border border-[#d9c9ef] bg-[#f8f4fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
        >
          {showPreview && avatarUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setPreviewFailed(true)}
              />
              <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-[#25135c]/0 pb-2 text-xs font-medium text-white opacity-0 transition group-hover:bg-[#25135c]/35 group-hover:opacity-100">
                Заменить
              </span>
            </>
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-[#8c79b6]">
              Загрузить
            </span>
          )}
        </button>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled || isBusy}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            {uploading || isSavingCrop
              ? "Загрузка…"
              : showPreview
                ? "Изменить"
                : "Загрузить"}
          </button>
          {avatarUrl ? (
            <button
              type="button"
              onClick={() => void deleteAvatar()}
              disabled={disabled || isBusy}
              className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2]"
            >
              {deleting ? "Удаление…" : "Удалить"}
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm leading-5 text-[#7d70a2]">{AVATAR_UPLOAD_HINT}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileChange}
      />

      {displayError ? (
        <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {displayError}
        </p>
      ) : null}
    </div>
  );
}
