"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  JAZZ_RELAX_PASSPORT_HELP_LINK_LABEL,
  JAZZ_RELAX_PASSPORT_HELP_SECTIONS,
  JAZZ_RELAX_PASSPORT_HELP_TITLE,
} from "@/lib/music-passport/jazz-relax-help";

/** Accessible modal built on the native <dialog> (focus trap, Esc to close). */
export function JazzRelaxPassportHelp({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== "function") return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-fit text-sm font-semibold text-[#7042c5] underline underline-offset-4 hover:text-[#25135c]"
        data-passport-help-link="true"
      >
        {JAZZ_RELAX_PASSPORT_HELP_LINK_LABEL}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="max-h-[85vh] w-[min(640px,calc(100vw-2rem))] overflow-y-auto rounded-[24px] border border-[#eadff8] bg-white p-0 text-[#25135c] backdrop:bg-black/40"
        data-passport-help-dialog="true"
      >
        <div className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-[20px] font-semibold">
              {JAZZ_RELAX_PASSPORT_HELP_TITLE}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
              className="rounded-full border border-[#d9c9ef] px-3 py-1 text-sm font-semibold text-[#5f5484]"
            >
              ✕
            </button>
          </div>
          {JAZZ_RELAX_PASSPORT_HELP_SECTIONS.map((section) => (
            <section key={section.heading} className="space-y-2">
              <h3 className="text-base font-semibold">{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-6 text-[#3f3560]">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
          >
            Полезно
          </button>
        </div>
      </dialog>
    </>
  );
}
