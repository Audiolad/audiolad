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

function LoadingShell({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1019] p-6 text-center text-[#edf0f7]">
      <p role="status" className="rounded-lg border border-white/10 bg-[#131b28] px-5 py-4 text-sm">
        {message}
      </p>
    </main>
  );
}

function Hydrator({
  projectId,
  recorderDebug,
  audioDebug,
}: {
  projectId: string;
  recorderDebug: boolean;
  audioDebug: boolean;
}) {
  const { decodePersistedAsset, hydratePersistedProject } = useStudioAudio();
  const [hydration, setHydration] = useState<StudioProjectHydration | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
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
        if (controller.signal.aborted || !active) return;
        if (caught instanceof StudioPersistenceError) {
          setError("Проект повреждён или создан в неподдерживаемой версии Студии.");
        } else if (caught instanceof StudioPersistenceClientError) {
          setError(caught.message);
        } else {
          setError("Не удалось открыть проект. Попробуйте ещё раз.");
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [decodePersistedAsset, hydratePersistedProject, projectId]);

  if (error) return <LoadingShell message={error} />;
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
      recorderDebug={recorderDebug}
      audioDebug={audioDebug}
    />
  );
}

export function PersistedStudioProjectShell({
  projectId,
  recorderDebug,
  audioDebug,
}: {
  projectId: string;
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
        recorderDebug={recorderDebug}
        audioDebug={audioDebug}
      />
    </StudioAudioProvider>
  );
}
