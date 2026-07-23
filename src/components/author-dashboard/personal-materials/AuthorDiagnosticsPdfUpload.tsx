"use client";

import { useRef, useState } from "react";

import { getPersonalMaterialDownloadErrorMessage } from "@/lib/personal-materials/client/errors";
import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";
import {
  formatFileSize,
  validateClientPdfFile,
} from "@/lib/personal-materials/client/validation";

type AuthorDiagnosticsPdfUploadProps = {
  hasPdf: boolean;
  pdfOriginalFilename: string | null;
  pdfSizeBytes: number | null;
  disabled?: boolean;
  uploading?: boolean;
  error?: string | null;
  onUpload: (file: File) => Promise<void>;
  onDownload: () => Promise<void>;
  onDelete: () => Promise<void>;
};

export default function AuthorDiagnosticsPdfUpload({
  hasPdf,
  pdfOriginalFilename,
  pdfSizeBytes,
  disabled = false,
  uploading = false,
  error,
  onUpload,
  onDownload,
  onDelete,
}: AuthorDiagnosticsPdfUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<number | null>(null);

  async function handleFile(file: File | null) {
    if (!file || disabled || uploading) {
      return;
    }

    const validation = await validateClientPdfFile(file);

    if (!validation.ok) {
      setLocalError(validation.message);
      setSelectedName(null);
      setSelectedSize(null);
      return;
    }

    setSelectedName(file.name);
    setSelectedSize(file.size);
    setLocalError(null);
    await onUpload(file);
  }

  async function handleDownload() {
    if (disabled || uploading || deleting || downloading || !hasPdf) {
      return;
    }

    setDownloading(true);
    setLocalError(null);

    try {
      await onDownload();
    } catch (error) {
      setLocalError(getPersonalMaterialDownloadErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (disabled || uploading || deleting || downloading || !hasPdf) {
      return;
    }

    setDeleting(true);
    setLocalError(null);

    try {
      await onDelete();
      setSelectedName(null);
      setSelectedSize(null);
    } finally {
      setDeleting(false);
    }
  }

  const limitLabel = formatFileSize(PERSONAL_MATERIAL_LIMITS.maxPdfBytes);
  const displayName = hasPdf
    ? (pdfOriginalFilename ?? selectedName ?? "document.pdf")
    : selectedName;
  const displaySize = hasPdf ? pdfSizeBytes : selectedSize;

  return (
    <section
      id="personal-material-pdf"
      className="min-w-0 scroll-mt-6 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5"
    >
      <h3 className="text-[18px] font-semibold">PDF-документ</h3>
      <p className="mt-2 text-sm text-[#7d70a2]">
        Можно добавить PDF с текстом диагностики, рекомендациями или дополнительными
        материалами. Максимальный размер — {limitLabel || "20 МБ"}.
      </p>

      <div
        className="mt-4 rounded-[20px] border border-dashed border-[#d8c7ef] bg-[#faf6ff] px-4 py-6 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void handleFile(event.dataTransfer.files.item(0));
        }}
      >
        {uploading ? (
          <div className="mx-auto max-w-xs" aria-live="polite">
            <p className="text-sm font-medium text-[#5f5484]">Загрузка PDF…</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#efe8f8]">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-[#7042c5]" />
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-[#5f5484]">
              {hasPdf ? "PDF-документ загружен" : "Выберите PDF-файл"}
            </p>
            <p className="mt-1 text-xs text-[#7d70a2]">
              Перетащите файл сюда или выберите на устройстве
            </p>
          </>
        )}

        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-4 min-h-11 w-full rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {uploading ? "Загрузка…" : hasPdf ? "Заменить" : "Загрузить PDF"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.item(0) ?? null;
            void handleFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {displayName ? (
        <div
          aria-live="polite"
          className="mt-4 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3"
        >
          {hasPdf ? (
            <p className="text-sm font-semibold text-[#3d8d65]">PDF-документ загружен</p>
          ) : null}
          <p className="mt-1 break-all text-sm font-medium text-[#3f365d]">{displayName}</p>
          {displaySize ? (
            <p className="mt-1 text-xs text-[#7d70a2]">{formatFileSize(displaySize)}</p>
          ) : null}
          {hasPdf ? (
            <div className="mt-3 flex min-w-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || uploading || deleting || downloading}
                className="min-h-11 shrink-0 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
              >
                Заменить файл
              </button>
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={disabled || uploading || deleting || downloading}
                className="min-h-11 shrink-0 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
              >
                {downloading ? "Скачивание…" : "Скачать файл"}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={disabled || uploading || deleting || downloading}
                className="min-h-11 shrink-0 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
              >
                {deleting ? "Удаление…" : "Удалить файл"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {localError || error ? (
        <p className="mt-3 text-sm text-[#b42318]" role="alert">
          {localError ?? error}
        </p>
      ) : null}
    </section>
  );
}
