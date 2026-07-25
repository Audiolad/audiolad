"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import {
  isPublishNotReadyResponse,
  PUBLISH_PREVIEW_NOT_READY_MESSAGE,
} from "@/lib/products/publish-preview";

type PublishPreviewBannerProps = {
  practiceId: string;
  editHref: string;
  publicPath: string;
  canPublish: boolean;
};

export default function PublishPreviewBanner({
  practiceId,
  editHref,
  publicPath,
  canPublish,
}: PublishPreviewBannerProps) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const publishInFlightRef = useRef(false);

  async function handlePublish() {
    if (!canPublish || publishInFlightRef.current) {
      return;
    }

    publishInFlightRef.current = true;
    setPublishing(true);
    setError(null);
    setNotReady(false);

    try {
      const response = await fetch(`/api/author/products/${practiceId}/publish`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        publishReady?: boolean;
      };

      if (!response.ok) {
        if (isPublishNotReadyResponse(payload)) {
          setNotReady(true);
          return;
        }

        setError(payload.message ?? "Не удалось опубликовать аудиопродукт.");
        return;
      }

      window.location.replace(publicPath);
    } catch {
      setError("Не удалось опубликовать аудиопродукт.");
    } finally {
      publishInFlightRef.current = false;
      setPublishing(false);
    }
  }

  return (
    <section className="mt-4 rounded-[20px] border border-[#d9c8f4] bg-[#f8f3ff] px-4 py-4 xl:mt-5">
      <p className="text-sm font-semibold text-[#5f3f9d]">👁 Предпросмотр</p>
      <p className="mt-1 text-sm leading-6 text-[#7d70a2]">
        Эту страницу сейчас видите только вы. После публикации она станет
        доступна слушателям.
      </p>

      {notReady ? (
        <p className="mt-3 text-sm leading-6 text-[#8d4d57]">
          {PUBLISH_PREVIEW_NOT_READY_MESSAGE}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm leading-6 text-[#8d4d57]">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link
          href={editHref}
          className="inline-flex min-h-11 items-center justify-center rounded-[16px] border border-[#bda6e1] bg-white px-4 py-2.5 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Вернуться к редактированию
        </Link>

        {canPublish ? (
          <button
            type="button"
            disabled={publishing}
            onClick={() => void handlePublish()}
            className="inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#7042c5] px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {publishing ? "Публикация…" : "Опубликовать"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
