"use client";

import { useEffect, useState } from "react";

import {
  StudioAudioProvider,
  useStudioAudio,
} from "@/components/studio/StudioAudioProvider";
import StudioEditorShell from "@/components/studio/StudioEditorShell";
import {
  downloadStudioProjectAsset,
  getStudioProjectForHydration,
  StudioPersistenceClientError,
} from "@/lib/studio/persistence-client";
import {
  hydrateStudioProject,
  type StudioProjectHydration,
} from "@/lib/studio/hydration";
import { StudioPersistenceError } from "@/lib/studio/persistence";

function LoadingShell({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1019] p-6 text-center text-[#edf0f7]">
      <div className="rounded-lg border border-white/10 bg-[#131b28] px-5 py-4 text-sm">
        <p role="status">{message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-3 rounded bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
            Повторить
          </button>
        ) : null}
      </div>
    </main>
  );
}

function Hydrator({
  projectId,
  accessMode,
  recorderDebug,
  audioDebug,
}: {
  projectId: string;
  accessMode: "author" | "guest";
  recorderDebug: boolean;
  audioDebug: boolean;
}) {
  const { decodePersistedAsset, hydratePersistedProject } = useStudioAudio();
  const [hydration, setHydration] = useState<StudioProjectHydration | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    void (async () => {
      try {
        const response = await getStudioProjectForHydration({
          projectId,
          signal: controller.signal,
        });
        const referenced = new Set(
          (() => {
            if (!response.project.projectData || typeof response.project.projectData !== "object") return [];
            const tracks = (response.project.projectData as { tracks?: unknown }).tracks;
            return Array.isArray(tracks)
              ? tracks.flatMap((track) =>
                  track && typeof track === "object" && typeof (track as { assetId?: unknown }).assetId === "string"
                    ? [(track as { assetId: string }).assetId]
                    : [],
                )
              : [];
          })(),
        );
        if (!active) return;
        setProgress({ completed: 0, total: referenced.size });
        const result = await hydrateStudioProject({
          project: response.project,
          assets: response.assets,
          signal: controller.signal,
          download: async (asset, signal) => {
            const blob = await downloadStudioProjectAsset({
              projectId,
              assetId: asset.id,
              signal,
            });
            if (active) {
              setProgress((current) =>
                current ? { ...current, completed: current.completed + 1 } : current,
              );
            }
            return blob;
          },
          decode: decodePersistedAsset,
        });
        if (!active) return;
        hydratePersistedProject(result);
        setHydration(result);
      } catch (caught) {
        if (!active) return;
        if (controller.signal.aborted && !timedOut) return;
        console.error("studio_project_hydration_error", {
          projectId,
          timedOut,
          error: caught instanceof Error ? caught.message : "unknown_error",
        });
        if (timedOut) {
          setError("Загрузка аудио заняла слишком много времени. Проверьте соединение и повторите попытку.");
          return;
        }
        if (caught instanceof StudioPersistenceError) {
          setError("Проект повреждён или создан в неподдерживаемой версии Студии.");
        } else if (caught instanceof StudioPersistenceClientError) {
          setError(caught.message);
        } else {
          setError("Не удалось открыть проект. Попробуйте ещё раз.");
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [decodePersistedAsset, hydratePersistedProject, projectId, retryCount]);

  if (error) {
    return (
      <LoadingShell
        message={error}
        onRetry={() => {
          setError(null);
          setProgress(null);
          setHydration(null);
          setRetryCount((count) => count + 1);
        }}
      />
    );
  }
  if (!hydration) {
    return (
      <LoadingShell
        message={
          progress
            ? `Загрузка аудио: ${progress.completed}/${progress.total}`
            : "Открываем проект…"
        }
      />
    );
  }
  return (
    <StudioEditorShell
      persistedHydration={hydration}
      accessMode={accessMode}
      recorderDebug={recorderDebug}
      audioDebug={audioDebug}
    />
  );
}

export function PersistedStudioProjectShell({
  projectId,
  accessMode = "author",
  recorderDebug,
  audioDebug,
}: {
  projectId: string;
  accessMode?: "author" | "guest";
  recorderDebug: boolean;
  audioDebug: boolean;
}) {
  return (
    <StudioAudioProvider
      persistenceProjectId={projectId}
      debugEnabled={audioDebug}
    >
      <Hydrator
        projectId={projectId}
        accessMode={accessMode}
        recorderDebug={recorderDebug}
        audioDebug={audioDebug}
      />
    </StudioAudioProvider>
  );
}
