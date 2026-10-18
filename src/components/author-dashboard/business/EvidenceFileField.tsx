"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  EVIDENCE_COPY,
  createEvidencePreviewStore,
  evidenceDoneText,
  formatEvidenceDate,
  formatEvidenceSize,
  isImageMime,
  isPdfMime,
  type EvidencePreviews,
  type EvidenceUploadState,
  type StoredEvidenceFile,
} from "@/lib/business-rightsholder/evidence-display";
import {
  validateEvidenceFile,
  type RightsholderEvidenceKind,
} from "@/lib/business-rightsholder/examples";

/** Accepted types; mirrors RIGHTSHOLDER_EVIDENCE_MIME and the storage bucket. */
export const EVIDENCE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
export const EVIDENCE_FORMAT_HINT = "PNG, JPG, WEBP или PDF, до 10 МБ";

/**
 * Local previews for chosen files. Object URLs are created in the change handler (not in
 * render or an effect), revoked when a slot is replaced, removed or reset, and on unmount
 * (see createEvidencePreviewStore). Only valid image files get a URL; PDFs show an icon.
 */
export function useEvidencePreviews() {
  const [store] = useState(() => createEvidencePreviewStore());
  const [previews, setPreviews] = useState<EvidencePreviews>({});

  const setPreview = useCallback((kind: RightsholderEvidenceKind, file: File | null) => {
    setPreviews(store.set(kind, file));
  }, [store]);

  const clearPreviews = useCallback(() => setPreviews(store.clear()), [store]);

  useEffect(() => () => store.dispose(), [store]);

  return { previews, setPreview, clearPreviews };
}

type Tone = "progress" | "ok" | "error";

// Author-cabinet (audiolad.ru) lavender palette: the same values as the rest of
// /author-dashboard (primary #7042c5, lavender borders/surfaces, cabinet green/red notices).
// Never the Business Jazz & Coffee theme tokens: they are scoped to business.audiolad.ru.
const TONE_CLASS: Record<Tone, string> = {
  progress: "bg-[#f3ecfd] text-[#4c3d78]",
  ok: "bg-[#f3fbf6] text-[#2f7a55]",
  error: "bg-[#fff5f5] text-[#9b3d3d]",
};

function PdfIcon() {
  return (
    <svg viewBox="0 0 40 48" className="h-11 w-9" aria-hidden="true" focusable="false">
      <path d="M4 2h22l10 10v32a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#ffffff" stroke="#c6afe6" strokeWidth="2" />
      <path d="M26 2v10h10" fill="none" stroke="#c6afe6" strokeWidth="2" />
      <rect x="5" y="26" width="30" height="13" rx="3" fill="#9b3d3d" />
      <text x="20" y="36" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif">PDF</text>
    </svg>
  );
}

type Props = {
  kind: RightsholderEvidenceKind;
  inputId: string;
  label: string;
  required: boolean;
  hint: string;
  /** Opens the «Посмотреть пример» lightbox; omitted in read-only mode. */
  onShowExample?: () => void;
  /** File chosen in this session (not yet stored until the form is submitted). */
  file: File | null;
  /** Object URL from useEvidencePreviews for an image `file`. */
  previewUrl?: string | null;
  /** File stored with the latest submitted attempt, shown when nothing new is chosen. */
  stored?: StoredEvidenceFile | null;
  /** Submit-time state for this slot. */
  upload?: EvidenceUploadState;
  /** Validation message from the form (for example «Добавьте файл»). */
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onSelect?: (file: File | null) => void;
};

/** One evidence upload slot: picker, thumbnail / PDF icon, status, «Заменить» / «Удалить». */
export default function EvidenceFileField({
  kind,
  inputId,
  label,
  required,
  hint,
  onShowExample,
  file,
  previewUrl = null,
  stored = null,
  upload = null,
  error,
  disabled = false,
  readOnly = false,
  onSelect,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  // After removing a new file over a stored one, «Заменить» stays; focus goes there.
  const replaceRef = useRef<HTMLButtonElement>(null);
  // Image decode result, keyed by the src it belongs to (stale results are ignored).
  const [decoded, setDecoded] = useState<{ src: string; ok: boolean } | null>(null);

  const localError = file ? validateEvidenceFile(file) : null;
  const mime = file ? file.type : stored?.mimeType ?? "";
  const imageSrc = file ? (localError ? null : previewUrl) : stored?.url ?? null;
  const showImage = Boolean(imageSrc) && isImageMime(mime) && !(decoded?.src === imageSrc && !decoded.ok);
  const imageReady = decoded?.src === imageSrc && decoded.ok;

  let tone: Tone | null = null;
  let statusText = "";
  let note = "";
  if (file) {
    if (upload?.phase === "uploading") {
      tone = "progress";
      statusText = EVIDENCE_COPY.loading;
    } else if (upload?.phase === "error") {
      tone = "error";
      statusText = upload.message;
    } else if (localError) {
      tone = "error";
      statusText = localError;
    } else if (isImageMime(mime) && decoded?.src === imageSrc && !decoded.ok) {
      tone = "error";
      statusText = EVIDENCE_COPY.previewBroken;
    } else if (isImageMime(mime) && !imageReady) {
      tone = "progress";
      statusText = EVIDENCE_COPY.loading;
    } else {
      tone = "ok";
      statusText = evidenceDoneText(mime);
      note = upload?.phase === "uploaded" ? "" : EVIDENCE_COPY.pendingSubmit;
    }
  } else if (stored) {
    tone = "ok";
    statusText = evidenceDoneText(stored.mimeType, true);
    note = readOnly ? EVIDENCE_COPY.storedHint : EVIDENCE_COPY.storedResubmitHint;
    if (!stored.url || (isImageMime(stored.mimeType) && decoded?.src === stored.url && !decoded.ok)) {
      note = `${EVIDENCE_COPY.storedUnavailable}. ${note}`;
    }
  }

  const hasContent = Boolean(file || stored);
  const name = file ? file.name : isPdfMime(mime) ? "PDF из заявки" : "Скриншот из заявки";
  const meta = [
    formatEvidenceSize(file ? file.size : stored?.sizeBytes ?? 0),
    !file && stored?.createdAt ? `от ${formatEvidenceDate(stored.createdAt)}` : "",
  ].filter(Boolean).join(" · ");
  const statusId = `${inputId}-status`;
  const errorId = `${inputId}-error`;
  const formatId = `${inputId}-format`;
  const fieldError = !localError && !(upload?.phase === "error") && error ? error : null;
  // Keyboard users reach the picker buttons, so they carry the status, error and format hint.
  const describedBy = [tone ? statusId : "", fieldError ? errorId : "", formatId].filter(Boolean).join(" ");

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div
      data-evidence-field={kind}
      data-evidence-state={tone ?? "empty"}
      className={`rounded-[18px] border p-4 text-[#25135c] ${hasContent ? "border-solid border-[#e4d7f4] bg-white" : "border-dashed border-[#c6afe6] bg-[#faf6ff]"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {readOnly ? (
          <span className="text-sm font-medium">{label}</span>
        ) : (
          <label htmlFor={inputId} className="text-sm font-medium">{label}{required ? " *" : " (необязательно)"}</label>
        )}
        {onShowExample && !readOnly ? (
          <button type="button" onClick={onShowExample}
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-[#7042c5] underline underline-offset-4 hover:text-[#5e32ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            aria-haspopup="dialog">
            Посмотреть пример
          </button>
        ) : null}
      </div>
      {readOnly ? null : <p className="mt-1 text-sm text-[#5f5484]">{hint}</p>}

      {readOnly ? null : (
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={EVIDENCE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            // Reset so choosing the same file again still fires onChange.
            e.target.value = "";
            if (!next) return;
            // The focused «Выбрать файл» button is replaced by «Заменить»; keep keyboard focus there.
            flushSync(() => onSelect?.(next));
            replaceRef.current?.focus();
          }}
        />
      )}

      {hasContent ? (
        <div className="mt-3 flex flex-wrap items-start gap-3 sm:flex-nowrap" data-evidence-preview>
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e4d7f4] bg-[#faf6ff]">
            {showImage && imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL / short-lived signed URL
              <img
                key={imageSrc}
                src={imageSrc}
                alt={`Предпросмотр: ${label}`}
                className="h-full w-full object-cover"
                onLoad={() => setDecoded({ src: imageSrc, ok: true })}
                onError={() => setDecoded({ src: imageSrc, ok: false })}
                data-evidence-thumb
              />
            ) : isPdfMime(mime) ? (
              <PdfIcon />
            ) : (
              <span aria-hidden="true" className="text-2xl text-[#5f5484]">🖼</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={name} data-evidence-name>{name}</p>
            {meta ? <p className="mt-0.5 text-xs text-[#5f5484]">{meta}</p> : null}
            {tone ? (
              <p id={statusId} role={tone === "error" ? "alert" : "status"} aria-live="polite"
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[tone]}`}
                data-evidence-status={tone}>
                {tone === "progress" ? (
                  <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
                ) : null}
                {statusText}
              </p>
            ) : null}
            {note ? <p className="mt-1 text-xs text-[#5f5484]">{note}</p> : null}
            {!file && stored?.url ? (
              <a href={stored.url} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-block text-xs font-medium text-[#7042c5] underline underline-offset-4 hover:text-[#5e32ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]">
                {EVIDENCE_COPY.open}
              </a>
            ) : null}
          </div>
          {readOnly ? null : (
            <div className="flex w-full gap-2 sm:w-auto sm:flex-col">
              <button ref={replaceRef} type="button" onClick={openPicker} disabled={disabled}
                aria-label={`${EVIDENCE_COPY.replace}: ${label}`}
                aria-describedby={describedBy}
                className="min-h-11 flex-1 rounded-full border border-[#d7c4f5] bg-white px-4 text-sm font-semibold text-[#7042c5] transition hover:border-[#c6afe6] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60 sm:flex-none">
                {EVIDENCE_COPY.replace}
              </button>
              {file ? (
                <button type="button" disabled={disabled}
                  onClick={() => {
                    // The focused «Удалить» button unmounts; keep keyboard focus in the field.
                    flushSync(() => onSelect?.(null));
                    (chooseRef.current ?? replaceRef.current)?.focus();
                  }}
                  aria-label={`${EVIDENCE_COPY.remove}: ${label}`}
                  aria-describedby={describedBy}
                  className="min-h-11 flex-1 rounded-full border border-[#e4d7f4] bg-white px-4 text-sm font-semibold text-[#9b3d3d] transition hover:border-[#f2c7c7] hover:bg-[#fff5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60 sm:flex-none">
                  {EVIDENCE_COPY.remove}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : readOnly ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button ref={chooseRef} type="button" onClick={openPicker} disabled={disabled}
            aria-label={`${EVIDENCE_COPY.choose}: ${label}`}
            aria-describedby={describedBy}
            className="min-h-11 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white transition hover:bg-[#5e32ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60">
            {EVIDENCE_COPY.choose}
          </button>
          <span id={formatId} className="text-xs text-[#5f5484]">{EVIDENCE_FORMAT_HINT}</span>
        </div>
      )}
      {hasContent && !readOnly ? <p id={formatId} className="mt-2 text-xs text-[#5f5484]">{EVIDENCE_FORMAT_HINT}</p> : null}
      {fieldError ? <p id={errorId} className="mt-2 text-sm text-[#9b3d3d]" role="alert">{fieldError}</p> : null}
    </div>
  );
}
