"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * «Да / Отмена» before a change reaches the venue.
 *
 * It is a real overlay on top of the page and the bottom menu. An inline card
 * used to appear above the block the owner was looking at, so on a phone the
 * question was off screen and «Создать атмосферу» looked dead.
 */
export default function VenueConfirmDialog({
  text,
  onYes,
  onNo,
}: {
  text: string;
  onYes: () => void;
  onNo: () => void;
}) {
  const yesRef = useRef<HTMLButtonElement>(null);
  const onNoRef = useRef(onNo);

  useEffect(() => {
    onNoRef.current = onNo;
  }, [onNo]);

  useEffect(() => {
    yesRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onNoRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const dialog: ReactNode = (
    <div
      className="business-venue-confirm"
      data-testid="biz-venue-confirm-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onNo();
      }}
    >
      <div
        className="business-app-card business-venue-confirm__card space-y-3"
        role="dialog"
        aria-modal="true"
        aria-label={text}
        data-testid="biz-venue-confirm"
      >
        <p className="text-[1.05rem] text-[var(--biz-text)]">{text}</p>
        <div className="flex flex-wrap gap-2">
          <button ref={yesRef} type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring" onClick={onYes} data-testid="biz-venue-confirm-yes">
            Да
          </button>
          <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" onClick={onNo} data-testid="biz-venue-confirm-no">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );

  // The dialog only opens after a tap, so the browser branch is the real one.
  // Theme tokens live on .business-app-root, so the overlay goes there.
  if (typeof document === "undefined") return dialog;
  const host = document.querySelector<HTMLElement>(".business-app-root") ?? document.body;
  return createPortal(dialog, host);
}
