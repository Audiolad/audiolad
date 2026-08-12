"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
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
                <li key={project.id}>
                  <Link
                    href={`/studio/project/${encodeURIComponent(project.id)}`}
                    className="flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-white/15 bg-[#21133d] px-5 py-4 transition hover:border-[#9bdab5]/65 hover:bg-[#271647]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">{project.name}</span>
                      <span className="mt-1 block text-sm text-[#cfc4e4]">
                        Изменён {formatUpdatedAt(project.updatedAt)}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-[#9bdab5]">Открыть</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
