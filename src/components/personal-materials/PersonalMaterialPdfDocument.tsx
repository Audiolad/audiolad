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

export default function PersonalMaterialPdfDocument({
  pdfApiPath,
  filename,
}: PersonalMaterialPdfDocumentProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPdf = useCallback(
    async (mode: "open" | "download") => {
      if (loading) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(pdfApiPath, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });

        if (response.status === 404) {
          setError("Документ недоступен.");
          return;
        }

        if (!response.ok) {
          setError("Не удалось открыть PDF. Попробуйте ещё раз.");
          return;
        }

        const payload = (await response.json()) as SignedPdfResponse;

        if (!payload.url) {
          setError("Не удалось открыть PDF. Попробуйте ещё раз.");
          return;
        }

        const displayName = getDisplayFilename(filename);

        if (mode === "download") {
          const anchor = document.createElement("a");
          anchor.href = payload.url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.download = displayName.endsWith(".pdf") ? displayName : `${displayName}.pdf`;
          anchor.click();
          return;
        }

        window.open(payload.url, "_blank", "noopener,noreferrer");
      } catch {
        setError("Не удалось открыть PDF. Проверьте соединение и попробуйте ещё раз.");
      } finally {
        setLoading(false);
      }
    },
    [filename, loading, pdfApiPath],
  );

  const displayName = getDisplayFilename(filename);

  return (
    <section
      aria-label="PDF-документ"
      className="rounded-2xl border border-[#ece6f5] bg-[#fcfbfe] p-4 sm:p-5"
    >
      <h2 className="text-lg font-semibold text-[#2f2647]">Документ</h2>
      <p className="mt-2 break-all text-sm text-[#6d628f]">{displayName}</p>

      <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={loading}
          onClick={() => void openPdf("open")}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {loading ? "Открываем…" : "Открыть PDF"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void openPdf("download")}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#ded5ef] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60 sm:w-auto"
        >
          Скачать PDF
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
