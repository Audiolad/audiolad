"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { StudioGuestProjectLimitGate } from "@/components/studio/StudioGuestGate";
import { trackGuestStudioEvent } from "@/lib/studio/guest-analytics";
import {
  createStudioProject,
  StudioPersistenceClientError,
} from "@/lib/studio/persistence-client";

type CreationStatus = "creating" | "failed" | "gated";

export function StudioProjectCreator({
  authorId,
  accessMode = "author",
  recorderDebug,
}: {
  authorId?: string;
  accessMode?: "author" | "guest";
  recorderDebug: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CreationStatus>("creating");
  const [error, setError] = useState<string | null>(null);
  const creationPromiseRef = useRef<Promise<void> | null>(null);
  const projectIdRef = useRef<string | null>(null);

  const createProject = useCallback(() => {
    if (projectIdRef.current || creationPromiseRef.current) {
      return creationPromiseRef.current ?? Promise.resolve();
    }

    setStatus("creating");
    setError(null);
    const request = createStudioProject({
      ...(authorId ? { authorId } : {}),
      name: "Новый проект",
    })
      .then((project) => {
        projectIdRef.current = project.id;
        if (accessMode === "guest") {
          void trackGuestStudioEvent("guest_project_created", "/studio/project/new");
        }
        const debugQuery = recorderDebug ? "?studioRecorderDebug=1" : "";
        router.replace(
          `/studio/project/${encodeURIComponent(project.id)}${debugQuery}`,
        );
      })
      .catch((caught: unknown) => {
        if (projectIdRef.current) return;
        if (
          caught instanceof StudioPersistenceClientError &&
          caught.code === "guest_project_limit"
        ) {
          setStatus("gated");
          setError(null);
          return;
        }
        setStatus("failed");
        setError(
          caught instanceof StudioPersistenceClientError
            ? caught.message
            : "Не удалось создать проект. Попробуйте ещё раз.",
        );
      })
      .finally(() => {
        creationPromiseRef.current = null;
      });
    creationPromiseRef.current = request;
    return request;
  }, [accessMode, authorId, recorderDebug, router]);

  useEffect(() => {
    void createProject();
  }, [createProject]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1019] p-6 text-center text-[#edf0f7]">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-[#131b28] p-6">
        {status === "creating" ? (
          <>
            <p role="status" className="text-base font-semibold">
              Создаём проект…
            </p>
            <p className="mt-2 text-sm text-[#b7c1d1]">
              Подготавливаем пространство для работы в Студии.
            </p>
          </>
        ) : status === "gated" ? (
          <StudioGuestProjectLimitGate />
        ) : (
          <>
            <p role="alert" className="text-base font-semibold text-rose-100">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void createProject()}
              className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-[#7650bd] px-4 text-sm font-semibold text-white"
            >
              Повторить
            </button>
          </>
        )}
      </section>
    </main>
  );
}
