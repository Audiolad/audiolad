"use client";

import { useRef, useState } from "react";

import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";
import {
  formatFileSize,
  isAllowedClientMp3File,
} from "@/lib/personal-materials/client/validation";

type AuthorDiagnosticsAudioUploadProps = {
  hasAudio: boolean;
  audioOriginalFilename: string | null;
  audioSizeBytes: number | null;
  disabled?: boolean;
  uploading?: boolean;
  error?: string | null;
  onUpload: (file: File) => Promise<boolean>;
  onDelete: () => Promise<void>;
};

export default function AuthorDiagnosticsAudioUpload({
  hasAudio,
  audioOriginalFilename,
  audioSizeBytes,
  disabled = false,
  uploading = false,
  error,
  onUpload,
  onDelete,
}: AuthorDiagnosticsAudioUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<number | null>(null);

  async function handleFile(file: File | null) {
    if (!file || disabled || uploading) {
      return;
    }

    if (!isAllowedClientMp3File(file)) {
      setLocalError("Выберите аудиофайл в формате MP3.");
      setSelectedName(null);
      setSelectedSize(null);
      return;
    }

    if (file.size <= 0) {
      setLocalError("Файл пустой. Выберите другой MP3-файл.");
      setSelectedName(null);
      setSelectedSize(null);
      return;
    }

    if (file.size > PERSONAL_MATERIAL_LIMITS.maxAudioBytes) {
      setLocalError("Размер файла превышает 50 МБ.");
      setSelectedName(null);
      setSelectedSize(null);
      return;
    }

    setSelectedName(file.name);
    setSelectedSize(file.size);
    setLocalError(null);
    const uploaded = await onUpload(file);

    if (!uploaded) {
      setSelectedName(null);
      setSelectedSize(null);
    }
  }

  async function handleDelete() {
    if (disabled || uploading || deleting || !hasAudio) {
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

  const limitLabel = formatFileSize(PERSONAL_MATERIAL_LIMITS.maxAudioBytes);
  const displayName = hasAudio
    ? (audioOriginalFilename ?? selectedName ?? "audio.mp3")
    : selectedName;
  const displaySize = hasAudio ? audioSizeBytes : selectedSize;

  return (
    <section
      id="personal-material-audio"
      className="min-w-0 scroll-mt-6 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5"
    >
      <h3 className="text-[18px] font-semibold">Аудиофайл</h3>
      <p className="mt-2 text-sm text-[#7d70a2]">
        Загрузите персональный аудиоматериал в формате MP3. Максимальный размер —{" "}
        {limitLabel || "50 МБ"}.
      </p>
      <p className="mt-1 text-xs text-[#7d70a2]">Поддерживаемый формат: MP3</p>

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
            <p className="text-sm font-medium text-[#5f5484]">Загрузка аудиофайла…</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#efe8f8]">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-[#7042c5]" />
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-[#5f5484]">
              {hasAudio ? "Аудиофайл загружен" : "Выберите MP3-файл"}
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
          {uploading
            ? "Загрузка…"
            : hasAudio
              ? "Заменить файл"
              : "Загрузить аудиофайл"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".mp3,audio/mpeg,audio/mp3,application/octet-stream"
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
          {hasAudio ? (
            <p className="text-sm font-semibold text-[#3d8d65]">Аудиофайл загружен</p>
          ) : null}
          <p className="mt-1 break-all text-sm font-medium text-[#3f365d]">{displayName}</p>
          {displaySize ? (
            <p className="mt-1 text-xs text-[#7d70a2]">{formatFileSize(displaySize)}</p>
          ) : null}
          {hasAudio ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || uploading || deleting}
                className="min-h-11 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
              >
                Заменить файл
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={disabled || uploading || deleting}
                className="min-h-11 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
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
