"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { StickerFormat } from "@/lib/business-app/venue-licence/sticker";
import { modalHost, useModalDialog } from "./useModalDialog";
import { venueStickerFilename, venueStickerHref } from "@/lib/business-app/venue-licence/sticker-links";

/** What the owner sees for each print file. The file name stays technical. */
export const VENUE_STICKER_ITEMS: Record<StickerFormat, { title: string; download: string; alt: string }> = {
  square80: {
    title: "Наклейка 80×80 мм",
    download: "Скачать наклейку 80×80 мм",
    alt: "Наклейка 80×80 мм с QR-кодом вашей кофейни",
  },
  a6: {
    title: "Настольная табличка А6",
    download: "Скачать настольную табличку А6",
    alt: "Настольная табличка А6 с QR-кодом вашей кофейни",
  },
};

export const VENUE_STICKER_PREVIEW_LABEL = "Посмотреть";

/**
 * «Скачать …» and «Посмотреть» for one print file.
 * «Посмотреть» opens the same SVG the download returns (with the venue's own QR)
 * in an overlay on this page: no new tab, no navigation, so the player keeps playing.
 */
export default function VenueStickerItem({ locationId, format }: { locationId: string; format: StickerFormat }) {
  const [open, setOpen] = useState(false);
  const item = VENUE_STICKER_ITEMS[format];
  const href = venueStickerHref(locationId, format);
  return (
    <div className="business-venue-sticker__row" data-testid={`biz-venue-sticker-row-${format}`}>
      <a
        href={href}
        download={venueStickerFilename(format)}
        className="business-app-btn business-app-btn-cta business-app-focus-ring"
        data-testid={`biz-venue-sticker-${format}`}
      >
        {item.download}
      </a>
      <button
        type="button"
        className="business-app-btn business-app-btn-secondary business-app-focus-ring"
        aria-haspopup="dialog"
        aria-label={`${VENUE_STICKER_PREVIEW_LABEL}: ${item.title.toLowerCase()}`}
        data-testid={`biz-venue-sticker-preview-${format}`}
        onClick={() => setOpen(true)}
      >
        {VENUE_STICKER_PREVIEW_LABEL}
      </button>
      {open ? <VenueStickerPreview href={href} format={format} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function VenueStickerPreview({ href, format, onClose }: { href: string; format: StickerFormat; onClose: () => void }) {
  const item = VENUE_STICKER_ITEMS[format];
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const titleId = `venue-sticker-preview-title-${format}`;
  useModalDialog(overlayRef, cardRef, closeRef, onClose);

  const dialog: ReactNode = (
    <div
      ref={overlayRef}
      className="business-venue-confirm business-venue-sticker-preview"
      data-testid="biz-venue-sticker-preview-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="business-app-card business-venue-sticker-preview__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="biz-venue-sticker-preview"
        data-format={format}
      >
        <div className="business-venue-sticker-preview__head">
          <h3 id={titleId} className="text-[1.05rem] font-bold text-[var(--biz-text)]">
            {item.title}
          </h3>
          <button
            ref={closeRef}
            type="button"
            className="business-venue-sticker-preview__x business-app-focus-ring"
            aria-label="Закрыть"
            data-testid="biz-venue-sticker-preview-x"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="business-venue-sticker-preview__art" data-state={state}>
          {state === "error" ? (
            <p className="text-sm text-[var(--biz-text-muted)]" role="alert">
              Не получилось показать макет. Попробуйте ещё раз или скачайте файл.
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- private per-venue SVG, not an optimisable asset
            <img
              src={href}
              alt={item.alt}
              className="business-venue-sticker-preview__img"
              data-testid="biz-venue-sticker-preview-img"
              onLoad={() => setState("ready")}
              onError={() => setState("error")}
            />
          )}
          {state === "loading" ? (
            <p className="business-venue-sticker-preview__loading text-sm text-[var(--biz-text-muted)]">Загружаем макет…</p>
          ) : null}
        </div>
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring w-full"
          data-testid="biz-venue-sticker-preview-close"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, modalHost());
}
