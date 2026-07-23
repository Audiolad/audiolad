"use client";

import { useState } from "react";

import { getPersonalMaterialDownloadErrorMessage } from "@/lib/personal-materials/client/errors";

type AuthorDiagnosticsAttachmentDownloadButtonProps = {
  label: string;
  downloadingLabel?: string;
  disabled?: boolean;
  onDownload: () => Promise<void>;
  fallbackErrorMessage?: string;
  className?: string;
};

const defaultButtonClassName =
  "min-h-11 shrink-0 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60";

export default function AuthorDiagnosticsAttachmentDownloadButton({
  label,
  downloadingLabel = "Скачивание…",
  disabled = false,
  onDownload,
  fallbackErrorMessage = "Не удалось скачать файл. Попробуйте ещё раз.",
  className = defaultButtonClassName,
}: AuthorDiagnosticsAttachmentDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (disabled || downloading) {
      return;
    }

    setDownloading(true);
    setError(null);

    try {
      await onDownload();
    } catch (error) {
      setError(getPersonalMaterialDownloadErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled || downloading}
        className={className}
      >
        {downloading ? downloadingLabel : label}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
