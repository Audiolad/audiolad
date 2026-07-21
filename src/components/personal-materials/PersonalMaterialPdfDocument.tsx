"use client";

import { useCallback, useState } from "react";

type PersonalMaterialPdfDocumentProps = {
  pdfApiPath: string;
  filename?: string | null;
};

type SignedPdfResponse = {
  url: string;
  expiresAt: string;
};

function getDisplayFilename(filename?: string | null): string {
  const trimmed = filename?.trim();
  return trimmed || "PDF-документ";
}

function closePreviewWindow(previewWindow: Window | null) {
  if (!previewWindow || previewWindow.closed) {
    return;
  }

  try {
    previewWindow.close();
  } catch {
    // ignore close failures in embedded browsers
  }
}

export default function PersonalMaterialPdfDocument({
  pdfApiPath,
  filename,
}: PersonalMaterialPdfDocumentProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPdf = useCallback(async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    const previewWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
    const popupBlocked = previewWindow === null;

    try {
      const response = await fetch(pdfApiPath, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 404) {
        closePreviewWindow(previewWindow);
        setError("Документ недоступен.");
        return;
      }

      if (!response.ok) {
        closePreviewWindow(previewWindow);
        setError("Не удалось открыть PDF. Попробуйте ещё раз.");
        return;
      }

      const payload = (await response.json()) as SignedPdfResponse;

      if (!payload.url) {
        closePreviewWindow(previewWindow);
        setError("Не удалось открыть PDF. Попробуйте ещё раз.");
        return;
      }

      if (previewWindow) {
        previewWindow.location.href = payload.url;
        return;
      }

      if (popupBlocked) {
        // Embedded browsers may block popups; same-tab fallback keeps browser history.
        window.location.assign(payload.url);
      }
    } catch {
      closePreviewWindow(previewWindow);
      setError("Не удалось открыть PDF. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [loading, pdfApiPath]);

  const displayName = getDisplayFilename(filename);

  return (
    <section
      aria-label="PDF-документ"
      className="rounded-2xl border border-[#ece6f5] bg-[#fcfbfe] p-4 sm:p-5"
    >
      <h2 className="text-lg font-semibold text-[#2f2647]">Документ</h2>
      <p className="mt-2 break-all text-sm text-[#6d628f]">{displayName}</p>

      <div className="mt-4">
        <button
          type="button"
          disabled={loading}
          onClick={() => void openPdf()}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {loading ? "Открываем…" : "Открыть PDF"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
