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
  onUpload: (file: File) => Promise<void>;
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

  async function handleFile(file: File | null) {
    if (!file || disabled || uploading) {
      return;
    }

    if (!isAllowedClientMp3File(file)) {
      setLocalError("Можно загрузить только MP3-файл.");
      return;
    }

    if (file.size <= 0 || file.size > PERSONAL_MATERIAL_LIMITS.maxAudioBytes) {
      setLocalError("Файл слишком большой. Максимальный размер — 50 МБ.");
      return;
    }

    setLocalError(null);
    await onUpload(file);
  }

  async function handleDelete() {
    if (disabled || uploading || deleting || !hasAudio) {
      return;
    }

    setDeleting(true);
    setLocalError(null);

    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  const limitLabel = formatFileSize(PERSONAL_MATERIAL_LIMITS.maxAudioBytes);

  return (
    <section className="min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
      <h3 className="text-[18px] font-semibold">Аудиофайл</h3>
      <p className="mt-2 text-sm text-[#7d70a2]">
        Загрузите MP3 с диагностикой. Максимальный размер — {limitLabel || "50 МБ"}.
      </p>

      <div
        className="mt-4 rounded-[20px] border border-dashed border-[#d8c7ef] bg-[#faf6ff] px-4 py-6 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void handleFile(event.dataTransfer.files.item(0));
        }}
      >
        <p className="text-sm font-medium text-[#5f5484]">Загрузите MP3 с диагностикой</p>
        <p className="mt-1 text-xs text-[#7d70a2]">Перетащите файл сюда или выберите на устройстве</p>

        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-4 min-h-11 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {uploading ? "Загрузка…" : hasAudio ? "Заменить MP3" : "Выбрать MP3"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.item(0) ?? null;
            void handleFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {hasAudio ? (
        <div
          aria-live="polite"
          className="mt-4 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3"
        >
          <p className="break-all text-sm font-medium text-[#3f365d]">
            {audioOriginalFilename ?? "audio.mp3"}
          </p>
          {audioSizeBytes ? (
            <p className="mt-1 text-xs text-[#7d70a2]">{formatFileSize(audioSizeBytes)}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={disabled || uploading || deleting}
            className="mt-3 min-h-11 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          >
            {deleting ? "Удаление…" : "Удалить аудио"}
          </button>
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
