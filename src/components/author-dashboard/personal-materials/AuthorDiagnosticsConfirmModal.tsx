"use client";

import { useEffect, useRef } from "react";

type AuthorDiagnosticsConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function AuthorDiagnosticsConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Отмена",
  confirmTone = "primary",
  loading = false,
  onConfirm,
  onCancel,
}: AuthorDiagnosticsConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    confirmRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  const confirmClassName =
    confirmTone === "danger"
      ? "bg-[#d64545] text-white hover:bg-[#bf3a3a]"
      : "bg-[#7042c5] text-white hover:bg-[#6237ad]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(36,24,58,0.45)] p-4 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostics-confirm-title"
        aria-describedby="diagnostics-confirm-description"
        className="w-full max-w-md rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_18px_40px_rgba(91,62,145,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="diagnostics-confirm-title" className="text-[18px] font-semibold">
          {title}
        </h2>
        <p id="diagnostics-confirm-description" className="mt-3 text-sm leading-6 text-[#5f5484]">
          {description}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-11 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 ${confirmClassName}`}
          >
            {loading ? "Подождите…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
