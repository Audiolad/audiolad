"use client";

import { useState } from "react";

import type { LearnerCourseFileBlock } from "@/lib/course-content/learner-types";

type CourseLearnerFileDownloadProps = {
  block: LearnerCourseFileBlock;
  authorSlug: string;
  productSlug: string;
};

export default function CourseLearnerFileDownload({
  block,
  authorSlug,
  productSlug,
}: CourseLearnerFileDownloadProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/listen/product/${encodeURIComponent(authorSlug)}/${encodeURIComponent(productSlug)}/file/${encodeURIComponent(block.fileId)}`,
      );
      const payload = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        setError("Не удалось открыть файл.");
        return;
      }

      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Не удалось открыть файл.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void download()}
        className="inline-flex min-h-11 items-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
      >
        {busy ? "Открываем…" : block.filename}
      </button>
      {error ? (
        <p className="mt-2 text-sm leading-6 text-[#b34f63]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
