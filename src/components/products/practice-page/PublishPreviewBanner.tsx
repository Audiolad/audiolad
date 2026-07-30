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
  listenerViewHref: string;
  canPublish: boolean;
};

function actionClassName(kind: "primary" | "secondary"): string {
  const layout =
    "inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-[16px] px-4 py-2 text-center text-sm font-semibold sm:w-auto";

  if (kind === "primary") {
    return `${layout} bg-[#7042c5] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60`;
  }

  return `${layout} border border-[#bda6e1] bg-white text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]`;
}

export default function PublishPreviewBanner({
  practiceId,
  editHref,
  publicPath,
  listenerViewHref,
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

      const separator = publicPath.includes("?") ? "&" : "?";
      window.location.replace(`${publicPath}${separator}published=1`);
    } catch {
      setError("Не удалось опубликовать аудиопродукт.");
    } finally {
      publishInFlightRef.current = false;
      setPublishing(false);
    }
  }

  return (
    <section className="mt-4 box-border w-full min-w-0 max-w-full rounded-[20px] border border-[#d9c8f4] bg-[#f8f3ff] px-4 py-4 xl:mt-5">
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

      <div className="mt-2.5 box-border grid w-full min-w-0 max-w-full grid-cols-1 gap-2 sm:grid-cols-[repeat(3,auto)] sm:justify-start">
        <Link href={editHref} className={actionClassName("secondary")}>
          Вернуться к редактированию
        </Link>

        <Link href={listenerViewHref} className={actionClassName("secondary")}>
          Посмотреть глазами слушателя
        </Link>

        {canPublish ? (
          <button
            type="button"
            disabled={publishing}
            onClick={() => void handlePublish()}
            className={actionClassName("primary")}
          >
            {publishing ? "Публикация…" : "Опубликовать"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
