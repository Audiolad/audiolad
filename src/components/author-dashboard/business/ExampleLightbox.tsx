"use client";

import { useEffect, useId, useRef } from "react";

import type { RightsholderExample } from "@/lib/business-rightsholder/examples";

type Props = {
  example: RightsholderExample | null;
  onClose: () => void;
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible lightbox: Esc / backdrop close, focus trap, focus return, scroll lock. */
export default function ExampleLightbox({ example, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!example) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [example, onClose]);

  if (!example) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-2 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-neutral-900">
            {example.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-full px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900"
            aria-label="Закрыть пример"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto bg-neutral-100 p-2 sm:p-4">
          {example.src ? (
            /* eslint-disable-next-line @next/next/no-img-element -- static redacted asset, natural zoom */
            <img
              src={example.src}
              width={example.width}
              height={example.height}
              alt={example.alt ?? example.title}
              className="mx-auto h-auto max-h-[80vh] w-auto max-w-full object-contain"
            />
          ) : (
            <div className="mx-auto max-w-prose rounded-xl bg-white p-4 text-sm text-neutral-800" data-text-example>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Текстовый пример — скриншота нет</p>
              <ul className="list-disc space-y-1 pl-5">
                {(example.textExample ?? []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <p className="border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600">{example.hint}</p>
      </div>
    </div>
  );
}
