"use client";

import { useCallback, useState } from "react";

import BannerPositionEditorModal from "@/components/author-dashboard/BannerPositionEditorModal";
import {
  formatBannerObjectPosition,
  getDefaultBannerPosition,
  normalizeStoredBannerPosition,
  type BannerPosition,
} from "@/lib/authors/banner-position";

import { saveBannerPosition } from "./banner-position-api";
import { useAuthorBannerUpload } from "./useAuthorBannerUpload";

export default function AuthorBannerUploadBlock({
  authorId,
  bannerUrl,
  bannerPosition,
  disabled,
  onUpdated,
}: {
  authorId: string;
  bannerUrl: string | null;
  bannerPosition: BannerPosition;
  disabled?: boolean;
  onUpdated: (payload: {
    url: string | null;
    bannerPosition: BannerPosition;
  }) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorImageSrc, setEditorImageSrc] = useState<string | null>(null);
  const [editorPosition, setEditorPosition] = useState<BannerPosition>(
    getDefaultBannerPosition(),
  );
  const [savingPosition, setSavingPosition] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);

  const closeEditor = useCallback(() => {
    if (savingPosition) return;
    setEditorOpen(false);
    setEditorImageSrc(null);
  }, [savingPosition]);

  const openEditor = useCallback(
    (imageSrc: string, position: BannerPosition) => {
      if (disabled || savingPosition) return;
      setPositionError(null);
      setEditorPosition(position);
      setEditorImageSrc(imageSrc);
      setEditorOpen(true);
    },
    [disabled, savingPosition],
  );

  const {
    fileInputRef,
    uploading,
    deleting,
    error,
    displaySrc,
    showPreview,
    openPicker,
    deleteAsset,
    handleFileChange,
    isBusy,
    setPreviewFailed,
    uploadHint,
  } = useAuthorBannerUpload({
    assetUrl: bannerUrl,
    authorId,
    disabled: disabled || savingPosition,
    onUpdated,
    onUploadComplete: (result) => {
      if (result.url) openEditor(result.url, result.bannerPosition);
    },
  });

  const handleEditPosition = useCallback(() => {
    if (!bannerUrl?.trim()) {
      openPicker();
      return;
    }
    openEditor(bannerUrl, bannerPosition);
  }, [bannerPosition, bannerUrl, openEditor, openPicker]);

  const handleSavePosition = useCallback(
    async (position: BannerPosition) => {
      setSavingPosition(true);
      setPositionError(null);
      try {
        const saved = await saveBannerPosition({ authorId, position });
        onUpdated({ url: bannerUrl, bannerPosition: saved.position });
        closeEditor();
      } catch {
        setPositionError("Не удалось сохранить положение баннера. Попробуйте ещё раз.");
      } finally {
        setSavingPosition(false);
      }
    },
    [authorId, bannerUrl, closeEditor, onUpdated],
  );

  const objectPosition = formatBannerObjectPosition(bannerPosition);

  return (
    <div>
      <span className="mb-2 block text-sm font-medium">Фоновый баннер</span>
      <div className="relative flex flex-col gap-4">
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || isBusy || savingPosition}
          className="group relative block h-32 w-full overflow-hidden rounded-[20px] border border-[#d9c9ef] bg-[#f8f4fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60 sm:h-40"
        >
          {showPreview && displaySrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displaySrc}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition }}
                onError={() => setPreviewFailed(true)}
              />
              <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-[#25135c]/0 pb-3 text-xs font-medium text-white opacity-0 transition group-hover:bg-[#25135c]/35 group-hover:opacity-100">
                Заменить баннер
              </span>
            </>
          ) : (
            <span className="flex h-full items-center justify-center text-sm text-[#8c79b6]">
              Загрузить баннер
            </span>
          )}
        </button>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleEditPosition}
            disabled={disabled || isBusy || savingPosition}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            {uploading ? "Загрузка…" : showPreview ? "Изменить" : "Загрузить"}
          </button>
          {bannerUrl ? (
            <button
              type="button"
              onClick={() => void deleteAsset()}
              disabled={disabled || isBusy || savingPosition}
              className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2]"
            >
              {deleting ? "Удаление…" : "Удалить"}
            </button>
          ) : null}
        </div>

        <p className="text-sm leading-5 text-[#7d70a2]">{uploadHint}</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileChange}
      />

      {error ? (
        <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}

      {positionError ? (
        <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {positionError}
        </p>
      ) : null}

      <BannerPositionEditorModal
        imageSrc={editorImageSrc ?? ""}
        position={editorPosition}
        isOpen={editorOpen && Boolean(editorImageSrc)}
        isSaving={savingPosition}
        onCancel={closeEditor}
        onSave={handleSavePosition}
      />
    </div>
  );
}

export function readBannerPositionFromProfileRow(profile: {
  banner_position_x?: unknown;
  banner_position_y?: unknown;
}): BannerPosition {
  return normalizeStoredBannerPosition(profile);
}
