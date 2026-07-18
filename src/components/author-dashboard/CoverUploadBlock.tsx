"use client";

import { ResponsiveCoverImage } from "@/components/images/ResponsiveImage";
import type { UseCoverUploadOptions } from "@/components/author-dashboard/useCoverUpload";
import { useCoverUpload } from "@/components/author-dashboard/useCoverUpload";

function CoverPlaceholderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path
        d="m5 17 4.5-4.5a1 1 0 0 1 1.4 0L15 17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 14.5 15.5 12a1 1 0 0 1 1.4 0L19 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoverPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center ${className}`}
    >
      <span className="text-[#9a86c4] transition-colors group-hover:text-[#8569b3] group-focus-visible:text-[#8569b3]">
        <CoverPlaceholderIcon />
      </span>
      <span className="text-xs text-[#8c79b6] transition-colors group-hover:text-[#7058a0] group-focus-visible:text-[#7058a0]">
        Нет обложки
      </span>
    </div>
  );
}

export type CoverUploadBlockProps = UseCoverUploadOptions & {
  label?: string;
  hint: string;
  previewSize?: "large" | "compact";
  uploadLabel?: string;
  replaceLabel?: string;
};

export default function CoverUploadBlock({
  label,
  hint,
  previewSize = "large",
  uploadLabel = "Загрузить обложку",
  replaceLabel = "Заменить обложку",
  disabled,
  ...uploadOptions
}: CoverUploadBlockProps) {
  const {
    fileInputRef,
    uploading,
    deleting,
    error,
    displayError,
    displaySrc,
    resolvedCover,
    useManifestPreview,
    showPreview,
    openPicker,
    deleteCover,
    handleFileChange,
    handlePreviewLoad,
    handlePreviewError,
    isBusy,
  } = useCoverUpload({ ...uploadOptions, disabled });

  const previewClassName =
    previewSize === "compact" ? "h-20 w-20" : "h-28 w-28";
  const previewWidth = previewSize === "compact" ? 80 : 112;

  return (
    <div>
      {label ? (
        <span className="mb-2 block text-sm font-medium">{label}</span>
      ) : null}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || isBusy}
          aria-label={showPreview ? replaceLabel : uploadLabel}
          className={`group relative z-10 block aspect-square ${previewClassName} shrink-0 cursor-pointer overflow-hidden rounded-[18px] border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60 ${
            showPreview
              ? "border-transparent bg-transparent hover:border-white/20 focus-visible:ring-2 focus-visible:ring-[#9a74d8]/50"
              : "border-[#d9c9ef] bg-[#f8f4fc] hover:border-[#9a74d8] hover:bg-[#f4ecfb] focus-visible:ring-2 focus-visible:ring-[#9a74d8]/50"
          }`}
        >
          {showPreview ? (
            <>
              {useManifestPreview ? (
                <ResponsiveCoverImage
                  src={resolvedCover.src}
                  alt=""
                  className="pointer-events-none block h-full w-full object-contain"
                  manifest={resolvedCover.manifest}
                  srcSet={resolvedCover.srcSet}
                  sizes={resolvedCover.srcSet ? resolvedCover.sizes : undefined}
                  displayWidth={previewWidth}
                  onError={handlePreviewError}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displaySrc ?? undefined}
                  alt=""
                  className="pointer-events-none block h-full w-full object-contain"
                  onLoad={handlePreviewLoad}
                  onError={handlePreviewError}
                />
              )}
              <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-[#25135c]/0 pb-2 text-xs font-medium text-white opacity-0 transition group-hover:bg-[#25135c]/35 group-hover:opacity-100 group-focus-visible:bg-[#25135c]/35 group-focus-visible:opacity-100">
                {replaceLabel}
              </span>
            </>
          ) : (
            <CoverPlaceholder />
          )}
        </button>

        <div className="relative z-0 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled || isBusy}
              className="inline-flex cursor-pointer rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] transition-colors hover:border-[#bda6e1] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading
                ? "Загрузка…"
                : showPreview
                  ? "Изменить"
                  : "Загрузить"}
            </button>
            {uploadOptions.coverUrl ? (
              <button
                type="button"
                onClick={() => void deleteCover()}
                disabled={disabled || isBusy}
                className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2] disabled:opacity-60"
              >
                {deleting ? "Удаление…" : "Удалить"}
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-sm leading-5 text-[#7d70a2]">{hint}</p>
        </div>
      </div>
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
      {error ? (
        <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
