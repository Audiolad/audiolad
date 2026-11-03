"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { qrMatrix } from "@/lib/business-app/venue-licence/qr";

import { modalHost, useModalDialog } from "./useModalDialog";

export const VENUE_QR_SHOW_LABEL = "Показать QR-код";

const QUIET = 4;

/** Black-on-white QR as one SVG path: maximum contrast for a phone camera. */
export function VenueQrSvg({ url, label }: { url: string; label: string }) {
  const { size, d } = useMemo(() => {
    const m = qrMatrix(url);
    let path = "";
    m.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) path += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
      }),
    );
    return { size: m.length + QUIET * 2, d: path };
  }, [url]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="business-venue-qr-full__svg"
      data-testid="biz-venue-qr-svg"
    >
      <rect width={size} height={size} fill="white" />
      <path d={d} fill="black" />
    </svg>
  );
}

/**
 * «Показать QR-код»: the venue's licence QR full screen on the phone, so an
 * inspector or a guest can scan it right away. No navigation – music keeps playing.
 */
export default function VenueQrShowButton({
  url,
  variant = "cta",
  testId = "biz-venue-qr-show",
  label = VENUE_QR_SHOW_LABEL,
  className = "",
}: {
  url: string;
  variant?: "cta" | "secondary";
  testId?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`business-app-btn ${variant === "cta" ? "business-app-btn-cta business-venue-qr-show" : "business-app-btn-secondary"} business-app-focus-ring${className ? ` ${className}` : ""}`}
        aria-haspopup="dialog"
        data-testid={testId}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? <VenueQrFullscreen url={url} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function VenueQrFullscreen({ url, onClose }: { url: string; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalDialog(overlayRef, overlayRef, closeRef, onClose);
  const dialog = (
    <div
      ref={overlayRef}
      className="business-venue-qr-full"
      role="dialog"
      aria-modal="true"
      aria-labelledby="venue-qr-full-title"
      data-testid="biz-venue-qr-full"
    >
      <h2 id="venue-qr-full-title" className="business-venue-qr-full__title">
        Подтверждение прав на музыку
      </h2>
      <p className="business-venue-qr-full__hint">Наведите камеру телефона на код</p>
      <div className="business-venue-qr-full__code">
        <VenueQrSvg url={url} label="QR-код страницы с подтверждением прав на музыку" />
      </div>
      <button
        ref={closeRef}
        type="button"
        className="business-app-btn business-app-btn-cta business-app-focus-ring business-venue-qr-full__close"
        data-testid="biz-venue-qr-close"
        onClick={onClose}
      >
        Закрыть
      </button>
    </div>
  );
  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, modalHost());
}
