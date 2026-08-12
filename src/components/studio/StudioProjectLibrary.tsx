"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  deleteStudioProject,
  listStudioProjects,
  StudioPersistenceClientError,
  type StudioProjectListItem,
} from "@/lib/studio/persistence-client";

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата изменения недоступна";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function StudioProjectLibrary({ authorId }: { authorId: string }) {
  const [projects, setProjects] = useState<StudioProjectListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [projectToDelete, setProjectToDelete] = useState<StudioProjectListItem | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void listStudioProjects({ authorId, signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) setProjects(items);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof StudioPersistenceClientError
            ? caught.message
            : "Не удалось загрузить проекты. Попробуйте ещё раз.",
        );
      });

    return () => controller.abort();
  }, [authorId, retryCount]);

  const retry = useCallback(() => {
    setProjects(null);
    setError(null);
    setRetryCount((count) => count + 1);
  }, []);

  const requestDelete = useCallback((project: StudioProjectListItem) => {
    setDeleteError(null);
    setProjectToDelete(project);
  }, []);

  const cancelDelete = useCallback(() => {
    if (deletingProjectId) return;
    setDeleteError(null);
    setProjectToDelete(null);
  }, [deletingProjectId]);

  const confirmDelete = useCallback(async () => {
    if (!projectToDelete || deletingProjectId) return;

    setDeleteError(null);
    setDeletingProjectId(projectToDelete.id);
    try {
      await deleteStudioProject({
        projectId: projectToDelete.id,
        expectedRevision: projectToDelete.revision,
      });
      setProjects((items) => items?.filter((project) => project.id !== projectToDelete.id) ?? null);
      setProjectToDelete(null);
    } catch {
      setDeleteError("Не удалось удалить проект");
    } finally {
      setDeletingProjectId(null);
    }
  }, [deletingProjectId, projectToDelete]);

  return (
    <section className="flex-1 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#9bdab5]">Студия аудиопрактик</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Мои проекты
            </h1>
          </div>
          <Link
            href="/studio/project/new"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530]"
          >
            + Новый проект
          </Link>
        </div>

        <div className="mt-8">
          {error ? (
            <section
              role="alert"
              className="rounded-2xl border border-rose-300/35 bg-rose-950/20 p-5"
            >
              <p className="font-semibold text-rose-100">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-white/20 px-4 text-sm font-semibold text-white"
              >
                Повторить
              </button>
            </section>
          ) : projects === null ? (
            <p
              role="status"
              className="rounded-2xl border border-white/15 bg-[#21133d] px-5 py-4 text-sm text-[#ddd2f5]"
            >
              Загружаем проекты…
            </p>
          ) : projects.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-white/25 bg-[#21133d] p-6">
              <h2 className="text-lg font-semibold">У вас пока нет проектов</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#cfc4e4]">
                Создайте первый проект — в нём уже будут дорожки для голоса и музыки.
              </p>
              <Link
                href="/studio/project/new"
                className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg border border-[#9bdab5]/65 px-4 text-sm font-semibold text-[#9bdab5]"
              >
                Создать первый проект
              </Link>
            </section>
          ) : (
            <ul className="space-y-3">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-white/15 bg-[#21133d] px-5 py-4"
                >
                  <Link
                    href={`/studio/project/${encodeURIComponent(project.id)}`}
                    className="min-w-0 flex-1 transition hover:text-[#9bdab5]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">{project.name}</span>
                      <span className="mt-1 block text-sm text-[#cfc4e4]">
                        Изменён {formatUpdatedAt(project.updatedAt)}
                      </span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/studio/project/${encodeURIComponent(project.id)}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#9bdab5]/65 px-3 text-sm font-semibold text-[#9bdab5]"
                    >
                      Открыть
                    </Link>
                    <button
                      type="button"
                      onClick={() => requestDelete(project)}
                      disabled={deletingProjectId === project.id}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-300/45 px-3 text-sm font-semibold text-rose-100 hover:bg-rose-950/35 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {projectToDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-delete-project-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-5"
        >
          <section className="w-full max-w-md rounded-2xl border border-white/15 bg-[#21133d] p-6 shadow-2xl">
            <h2 id="studio-delete-project-title" className="text-xl font-semibold">
              Удалить проект?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#ddd2f5]">
              Проект «{projectToDelete.name}» будет удалён из Студии.
            </p>
            {deleteError ? (
              <p role="alert" className="mt-4 text-sm font-medium text-rose-100">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={deletingProjectId === projectToDelete.id}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/20 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deletingProjectId === projectToDelete.id}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-rose-500 px-4 text-sm font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingProjectId === projectToDelete.id ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
