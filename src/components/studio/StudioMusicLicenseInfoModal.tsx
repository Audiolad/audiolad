"use client";

import { useEffect } from "react";

import {
  STUDIO_LICENSE_MODAL_BULLETS,
  STUDIO_LICENSE_MODAL_FORBIDDEN,
  STUDIO_LICENSE_MODAL_FULL_TERMS_HREF,
  STUDIO_LICENSE_MODAL_FULL_TERMS_LABEL,
  STUDIO_LICENSE_MODAL_LEAD,
  STUDIO_LICENSE_MODAL_TERM_FOOTNOTE,
  STUDIO_LICENSE_MODAL_TITLE,
} from "@/lib/studio-music/license-ui-copy";

export function StudioMusicLicenseInfoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-3 sm:items-center sm:p-5"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-music-license-info-title"
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#162033] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2
            id="studio-music-license-info-title"
            className="text-base font-semibold text-[#e8edf8]"
          >
            {STUDIO_LICENSE_MODAL_TITLE}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-medium text-[#9ba7bb] hover:bg-white/5"
            aria-label="Закрыть"
          >
            Закрыть
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-3 text-sm leading-6 text-[#c9d4e8]">
          <p className="font-medium text-[#e8edf8]">{STUDIO_LICENSE_MODAL_LEAD}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {STUDIO_LICENSE_MODAL_BULLETS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-4 text-[#f0c9c9]">{STUDIO_LICENSE_MODAL_FORBIDDEN}</p>
          <p className="mt-4">
            <a
              href={STUDIO_LICENSE_MODAL_FULL_TERMS_HREF}
              className="font-semibold text-[#d8c8fb] underline"
              target="_blank"
              rel="noreferrer"
            >
              {STUDIO_LICENSE_MODAL_FULL_TERMS_LABEL}
            </a>
          </p>
          <p className="mt-5 text-[11px] leading-5 text-[#8b95a8]">
            {STUDIO_LICENSE_MODAL_TERM_FOOTNOTE}
          </p>
        </div>
      </section>
    </div>
  );
}
