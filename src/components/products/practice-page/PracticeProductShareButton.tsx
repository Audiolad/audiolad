"use client";

import { useEffect, useState, type MouseEvent } from "react";

import {
  buildProductSharePayload,
  shareProductPage,
  toastForShareResult,
} from "@/lib/products/share";

type PracticeProductShareButtonProps = {
  title: string;
  path: string;
  subtitle?: string | null;
};

export default function PracticeProductShareButton({
  title,
  path,
  subtitle = null,
}: PracticeProductShareButtonProps) {
  const payload = buildProductSharePayload({ title, path, subtitle });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!payload) {
    return null;
  }

  const sharePayload = payload;

  async function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const result = await shareProductPage(sharePayload, {
      share: navigator.share?.bind(navigator),
      canShare: navigator.canShare?.bind(navigator),
      writeText: navigator.clipboard?.writeText?.bind(navigator.clipboard),
    });

    setToast(toastForShareResult(result));
  }

  return (
    <>
      <button
        type="button"
        data-practice-share-button
        aria-label="Поделиться"
        onClick={onClick}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#4b2f86] shadow-[0_4px_12px_rgba(36,19,63,0.28)] before:absolute before:-inset-1 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v11" />
          <path d="M8.5 6.5 12 3l3.5 3.5" />
          <path d="M7 11v7.25A1.75 1.75 0 0 0 8.75 20h6.5A1.75 1.75 0 0 0 17 18.25V11" />
        </svg>
      </button>
      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
          role="status"
          aria-live="polite"
        >
          <p className="rounded-full bg-[#25135c] px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </>
  );
}
