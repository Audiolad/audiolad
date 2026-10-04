"use client";

import { useRef } from "react";

import { formatClassicaByteSize, type ClassicaAssetKind } from "@/lib/classica/production/files";
import {
  classicaUploadRows,
  type ClassicaUploadAssetView,
  type ClassicaUploadProvisional,
} from "@/lib/classica/production/upload-client";

const fieldClass = "rounded-xl border border-[#e4d7f4] px-3 py-2 text-sm";
const addButtonClass =
  "mt-3 flex min-h-16 w-full items-center justify-center rounded-2xl bg-[#7042c5] px-4 py-4 text-base font-semibold text-white disabled:opacity-60";
const replaceButtonClass =
  "rounded-xl border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60";
const deleteButtonClass =
  "rounded-xl border border-[#f0c9d2] px-4 py-2 text-sm font-semibold text-[#9b2c4a] disabled:opacity-60";

export type ClassicaUploadPanelProps = {
  jobId: string;
  kind: ClassicaAssetKind;
  label: string;
  accept: string;
  showText: boolean;
  assets: readonly ClassicaUploadAssetView[];
  altText: string;
  titleText: string;
  onAltTextChange: (value: string) => void;
  onTitleTextChange: (value: string) => void;
  uploading: boolean;
  hiddenAssetIds: readonly string[];
  namesByPath: Readonly<Record<string, string>>;
  previewsByPath: Readonly<Record<string, string>>;
  provisional: ClassicaUploadProvisional | null;
  error: { fileName: string; message: string } | null;
  onFile: (file: File, replaceAssetId: string | null) => void;
  removeAction: (formData: FormData) => void | Promise<void>;
};

export default function ClassicaUploadPanel({
  jobId,
  kind,
  label,
  accept,
  showText,
  assets,
  altText,
  titleText,
  onAltTextChange,
  onTitleTextChange,
  uploading,
  hiddenAssetIds,
  namesByPath,
  previewsByPath,
  provisional,
  error,
  onFile,
  removeAction,
}: ClassicaUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);
  const rows = classicaUploadRows({
    assets,
    namesByPath,
    previewsByPath,
    hiddenAssetIds: uploading ? hiddenAssetIds : [],
    provisional: uploading ? null : provisional,
  });
  const showAdd = !uploading && (kind === "slider" || rows.length === 0);

  function openPicker(replaceAssetId: string | null) {
    if (uploading) {
      return;
    }
    replaceIdRef.current = replaceAssetId;
    inputRef.current?.click();
  }

  return (
    <section className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
      <h3 className="text-sm font-semibold">{label}</h3>
      {showText ? (
        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-sm">
            Альтернативный текст
            <input
              className={fieldClass}
              value={altText}
              onChange={(event) => onAltTextChange(event.target.value)}
              placeholder="Альтернативный текст"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Подпись
            <input
              className={fieldClass}
              value={titleText}
              onChange={(event) => onTitleTextChange(event.target.value)}
              placeholder="Подпись"
            />
          </label>
        </div>
      ) : null}

      {uploading ? (
        <p
          className="mt-3 flex min-h-16 items-center justify-center rounded-2xl bg-[#f3eefe] px-4 text-base font-semibold text-[#7042c5]"
          role="status"
          aria-live="polite"
        >
          Загрузка…
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="mt-3 grid gap-3">
          {rows.map((row) => (
            <li key={row.key} className="rounded-xl border border-[#e4d7f4] bg-[#fbf8ff] p-3">
              {row.previewUrl ? (
                // Signed production previews and local object URLs are not Next image sources.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.previewUrl}
                  alt={row.altText || label}
                  className="max-h-40 w-full rounded-xl bg-[#f7f4fb] object-contain"
                />
              ) : null}
              <p className="mt-2 break-all text-sm font-medium">{row.name}</p>
              <p className="mt-1 text-sm text-[#796ba0]">{formatClassicaByteSize(row.size)}</p>
              <p className="mt-1 text-sm font-semibold text-[#2f7d4a]">Загружено</p>
              {kind === "slider" && row.altText ? (
                <p className="mt-1 text-xs text-[#796ba0]">Альтернативный текст: {row.altText}</p>
              ) : null}
              {kind === "slider" && row.titleText ? (
                <p className="mt-1 text-xs text-[#796ba0]">Подпись: {row.titleText}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={replaceButtonClass}
                  disabled={uploading || !row.assetId}
                  onClick={() => openPicker(row.assetId)}
                >
                  Заменить
                </button>
                {row.assetId ? (
                  <form action={removeAction}>
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="asset_id" value={row.assetId} />
                    <button type="submit" className={deleteButtonClass} disabled={uploading}>
                      Удалить
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showAdd ? (
        <button type="button" className={addButtonClass} onClick={() => openPicker(null)}>
          Загрузить файл
        </button>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-[#9b2c4a]" role="alert">
          {error.fileName}: {error.message}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) {
            return;
          }
          const replaceAssetId = replaceIdRef.current;
          replaceIdRef.current = null;
          onFile(file, replaceAssetId);
        }}
      />
    </section>
  );
}
