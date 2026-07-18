"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  applyBannerPositionDragDelta,
  clampBannerPositionToCoverExcess,
  computeBannerCoverExcess,
  DEFAULT_BANNER_POSITION_X,
  DEFAULT_BANNER_POSITION_Y,
  formatBannerObjectPosition,
  type BannerPosition,
} from "@/lib/authors/banner-position";

type BannerPositionEditorModalProps = {
  imageSrc: string;
  position: BannerPosition;
  isOpen: boolean;
  isSaving?: boolean;
  onCancel: () => void;
  onSave: (position: BannerPosition) => void | Promise<void>;
};

export default function BannerPositionEditorModal({
  imageSrc,
  position,
  isOpen,
  isSaving = false,
  onCancel,
  onSave,
}: BannerPositionEditorModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const dragActiveRef = useRef(false);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    position: BannerPosition;
  } | null>(null);
  const [draftPosition, setDraftPosition] = useState(position);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen) return;
    setDraftPosition(position);
    dragActiveRef.current = false;
    dragStartRef.current = null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [imageSrc, isOpen, position]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onCancel]);

  useEffect(() => {
    if (!isOpen || !frameRef.current) return;
    const element = frameRef.current;
    function measureFrame() {
      setFrameSize({ width: element.clientWidth, height: element.clientHeight });
    }
    measureFrame();
    const observer = new ResizeObserver(measureFrame);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen]);

  const excess =
    imageSize && frameSize
      ? computeBannerCoverExcess(
          frameSize.width,
          frameSize.height,
          imageSize.width,
          imageSize.height,
        )
      : { excessX: 0, excessY: 0 };

  const clampedPosition = clampBannerPositionToCoverExcess(draftPosition, excess);
  const objectPosition = formatBannerObjectPosition(clampedPosition);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isSaving) return;
      dragActiveRef.current = true;
      dragStartRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        position: clampedPosition,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [clampedPosition, isSaving],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragActiveRef.current || !dragStartRef.current) return;
      const deltaX = event.clientX - dragStartRef.current.pointerX;
      const deltaY = event.clientY - dragStartRef.current.pointerY;
      setDraftPosition(
        applyBannerPositionDragDelta(
          dragStartRef.current.position,
          deltaX,
          deltaY,
          excess,
        ),
      );
    },
    [excess],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragActiveRef.current = false;
    dragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#25135c]/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => {
        if (!dragActiveRef.current && !isSaving) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[100dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-[24px] border border-[#eadff8] bg-white shadow-[0_20px_50px_rgba(86,52,141,0.22)] sm:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#f0e8f8] px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[20px] font-semibold text-[#25135c]">
              Положение баннера
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#796ba0]">
              Перетащите изображение, чтобы выбрать видимую область. Обычно достаточно
              сдвинуть баннер вверх или вниз.
            </p>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            disabled={isSaving}
            onClick={onCancel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#7042c5] hover:bg-[#f4ecfb]"
          >
            ×
          </button>
        </div>

        <div className="px-5 pt-5">
          <div
            ref={frameRef}
            className="relative h-32 w-full touch-none overflow-hidden rounded-[20px] border border-[#d9c9ef] bg-[#1b1230] sm:h-40"
            style={{ touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full select-none object-cover"
              style={{ objectPosition }}
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 px-5">
          <button
            type="button"
            disabled={isSaving}
            onClick={() =>
              setDraftPosition({
                x: DEFAULT_BANNER_POSITION_X,
                y: DEFAULT_BANNER_POSITION_Y,
              })
            }
            className="rounded-full border border-[#d9c6f2] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            По центру
          </button>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 px-5 pb-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c6f2] px-5 py-2.5 text-sm font-semibold text-[#7042c5]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void onSave(clampedPosition)}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white"
          >
            {isSaving ? "Сохранение…" : "Сохранить положение"}
          </button>
        </div>
      </div>
    </div>
  );
}
