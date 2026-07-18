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
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

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

export default function AvatarCropperModal({
  imageSrc,
  sourceBlob,
  sourceMime,
  isOpen,
  isSaving = false,
  onCancel,
  onConfirm,
}: AvatarCropperModalProps) {
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setMinZoom(1);
    setMaxZoom(4);
    setCroppedAreaPixels(null);
    setLocalError(null);
    dragActiveRef.current = false;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [imageSrc, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSaving, onCancel]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const onMediaLoaded = useCallback(
    (mediaSize: { naturalWidth: number; naturalHeight: number }) => {
      const cropSize =
        cropContainerRef.current?.clientWidth ??
        cropContainerRef.current?.offsetWidth ??
        360;
      const nextMinZoom = computeCoverMinZoom(
        mediaSize.naturalWidth,
        mediaSize.naturalHeight,
        cropSize,
        cropSize,
      );
      const nextMaxZoom = Math.max(nextMinZoom * 4, 4);

      setMinZoom(nextMinZoom);
      setMaxZoom(nextMaxZoom);
      setZoom(nextMinZoom);
    },
    [],
  );

  const handleBackdropClick = useCallback(() => {
    if (dragActiveRef.current || isSaving) {
      return;
    }

    onCancel();
  }, [isSaving, onCancel]);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels || isSaving) {
      return;
    }

    setLocalError(null);

    try {
      const output = await cropAvatarToBlob(sourceBlob, croppedAreaPixels, {
        sourceMime: sourceMime ?? sourceBlob.type,
      });
      const file = new File([output.blob], output.fileName, {
        type: output.mimeType,
        lastModified: Date.now(),
      });

      await onConfirm(file);
    } catch {
      setLocalError("Не удалось подготовить изображение. Попробуйте ещё раз.");
    }
  }, [croppedAreaPixels, isSaving, onConfirm, sourceBlob, sourceMime]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#25135c]/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[24px] border border-[#eadff8] bg-white shadow-[0_20px_50px_rgba(86,52,141,0.22)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[24px]"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#f0e8f8] px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[20px] font-semibold text-[#25135c]">
              Настройте фотографию
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#796ba0]">
              Перемещайте и масштабируйте изображение, чтобы выбрать область, которая
              будет видна в профиле
            </p>
          </div>

          <button
            type="button"
            aria-label="Закрыть"
            disabled={isSaving}
            onClick={onCancel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#7042c5] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
          >
            <CloseIcon />
          </button>
        </div>

        <div
          ref={cropContainerRef}
          className="relative mx-auto mt-4 aspect-square w-full max-w-[min(100%,360px)] touch-none bg-[#1b1230]"
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
              disabled={isSaving}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-2 w-full accent-[#7042c5]"
            />
          </label>
        </div>

        {localError ? (
          <p className="px-5 pt-4 text-sm text-[#b34f63]">{localError}</p>
        ) : null}

        <div
          className="mt-5 flex flex-col-reverse gap-3 px-5 pb-5 sm:flex-row sm:justify-end"
          style={{
            paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          }}
        >
          <button
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c6f2] px-5 py-2.5 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isSaving || !croppedAreaPixels}
            onClick={() => void handleConfirm()}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
