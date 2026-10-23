"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { cropAvatarToBlob } from "@/lib/images/avatar-crop-canvas";
import { computeCoverMinZoom } from "@/lib/images/avatar-crop-math";

type AvatarCropperModalProps = {
  imageSrc: string;
  sourceBlob: Blob;
  sourceMime?: string;
  isOpen: boolean;
  isSaving?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  frameLabel?: string;
  externalError?: string | null;
  minCropSourcePx?: number;
  maxOutputSize?: number;
  outputFileBase?: string;
  cropKind?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

type AvatarCropperContentProps = Omit<AvatarCropperModalProps, "isOpen">;

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AvatarCropperContent({
  imageSrc,
  sourceBlob,
  sourceMime,
  isSaving = false,
  title = "Настройте фотографию",
  description = "Перемещайте и масштабируйте изображение, чтобы выбрать область, которая будет видна в профиле",
  confirmLabel = "Сохранить",
  frameLabel,
  externalError = null,
  minCropSourcePx,
  maxOutputSize,
  outputFileBase,
  cropKind,
  onCancel,
  onConfirm,
}: AvatarCropperContentProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const dragActiveRef = useRef(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(4);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const preparingRef = useRef(false);
  const mountedRef = useRef(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isBusy = isSaving || isPreparing;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      // Pending crop work must not upload after the dialog was closed.
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();

    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!isBusy && !preparingRef.current) {
          onCancel();
        }
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialogRef.current.contains(active);

      if (event.shiftKey && (active === first || !inside || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBusy, onCancel]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const onMediaLoaded = useCallback(
    (mediaSize: { naturalWidth: number; naturalHeight: number }) => {
      const cropSize =
        cropContainerRef.current?.clientWidth ??
        cropContainerRef.current?.offsetWidth ??
        360;
      let nextMinZoom = computeCoverMinZoom(
        mediaSize.naturalWidth,
        mediaSize.naturalHeight,
        cropSize,
        cropSize,
      );
      const shortSide = Math.min(
        mediaSize.naturalWidth,
        mediaSize.naturalHeight,
      );
      let nextMaxZoom = Math.max(nextMinZoom * 4, 4);

      if (minCropSourcePx && minCropSourcePx > 0 && shortSide > 0) {
        const room = Math.min(4, Math.max(1, shortSide / minCropSourcePx));
        // react-easy-crop shows the whole short side at zoom 1. A lower
        // computed minimum stays clamped there, so the slider would not zoom.
        const coverZoom = Math.max(nextMinZoom, 1);
        nextMinZoom = coverZoom;
        nextMaxZoom = coverZoom * room;
      }

      setMinZoom(nextMinZoom);
      setMaxZoom(Math.max(nextMaxZoom, nextMinZoom));
      setZoom(nextMinZoom);
    },
    [minCropSourcePx],
  );

  const handleBackdropClick = useCallback(() => {
    if (dragActiveRef.current || isBusy || preparingRef.current) {
      return;
    }

    onCancel();
  }, [isBusy, onCancel]);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels || isSaving || preparingRef.current) {
      return;
    }

    preparingRef.current = true;
    setIsPreparing(true);
    setLocalError(null);

    try {
      const output = await cropAvatarToBlob(sourceBlob, croppedAreaPixels, {
        sourceMime: sourceMime ?? sourceBlob.type,
        maxOutputSize,
        fileBase: outputFileBase,
      });
      const file = new File([output.blob], output.fileName, {
        type: output.mimeType,
        lastModified: Date.now(),
      });

      if (!mountedRef.current) {
        return;
      }

      await onConfirm(file);
    } catch {
      if (mountedRef.current) {
        setLocalError("Не удалось подготовить изображение. Попробуйте ещё раз.");
      }
    } finally {
      preparingRef.current = false;
      if (mountedRef.current) {
        setIsPreparing(false);
      }
    }
  }, [
    croppedAreaPixels,
    isSaving,
    maxOutputSize,
    onConfirm,
    outputFileBase,
    sourceBlob,
    sourceMime,
  ]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#25135c]/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-crop-kind={cropKind}
        className="flex max-h-[100dvh] w-full max-w-[480px] outline-none flex-col overflow-y-auto rounded-t-[24px] border border-[#eadff8] bg-white shadow-[0_20px_50px_rgba(86,52,141,0.22)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[24px]"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#f0e8f8] px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[20px] font-semibold text-[#25135c]">
              {title}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#796ba0]">
              {description}
            </p>
          </div>

          <button
            type="button"
            aria-label="Закрыть"
            disabled={isBusy}
            onClick={onCancel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#7042c5] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
          >
            <CloseIcon />
          </button>
        </div>

        {frameLabel ? (
          <p className="px-5 pt-4 text-sm font-medium text-[#65577f]">{frameLabel}</p>
        ) : null}

        <div
          ref={cropContainerRef}
          aria-label={frameLabel ?? "Область кадрирования"}
          className="relative mx-auto mt-4 aspect-square w-full max-w-[min(100%,360px)] max-h-[min(360px,52dvh)] touch-none bg-[#1b1230]"
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={false}
            restrictPosition
            minZoom={minZoom}
            maxZoom={maxZoom}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            onMediaLoaded={onMediaLoaded}
            onInteractionStart={() => {
              dragActiveRef.current = true;
            }}
            onInteractionEnd={() => {
              window.setTimeout(() => {
                dragActiveRef.current = false;
              }, 0);
            }}
          />
        </div>

        <div className="px-5 pt-5">
          <label className="block text-sm font-medium text-[#65577f]">
            Масштаб
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.01}
              value={zoom}
              disabled={isBusy}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-2 w-full accent-[#7042c5]"
            />
          </label>
        </div>

        {localError ? (
          <p className="px-5 pt-4 text-sm text-[#b34f63]">{localError}</p>
        ) : null}
        {externalError ? (
          <p className="px-5 pt-4 text-sm text-[#b34f63]">{externalError}</p>
        ) : null}

        <div
          className="mt-5 flex flex-col-reverse gap-3 px-5 pb-5 sm:flex-row sm:justify-end"
          style={{
            paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          }}
        >
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c6f2] px-5 py-2.5 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isBusy || !croppedAreaPixels}
            onClick={() => void handleConfirm()}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isBusy ? "Сохранение…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AvatarCropperModal({
  imageSrc,
  sourceBlob,
  sourceMime,
  isOpen,
  isSaving = false,
  title,
  description,
  confirmLabel,
  frameLabel,
  externalError,
  minCropSourcePx,
  maxOutputSize,
  outputFileBase,
  cropKind,
  onCancel,
  onConfirm,
}: AvatarCropperModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <AvatarCropperContent
      key={imageSrc}
      imageSrc={imageSrc}
      sourceBlob={sourceBlob}
      sourceMime={sourceMime}
      isSaving={isSaving}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      frameLabel={frameLabel}
      externalError={externalError}
      minCropSourcePx={minCropSourcePx}
      maxOutputSize={maxOutputSize}
      outputFileBase={outputFileBase}
      cropKind={cropKind}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
