"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  deleteAuthorPersonalMaterialTemplate,
  duplicateAuthorPersonalMaterialTemplate,
  instantiateAuthorPersonalMaterialTemplate,
  listAuthorPersonalMaterialTemplates,
  type AuthorPersonalMaterialTemplate,
} from "@/lib/personal-materials/client/api";
import { getPersonalMaterialErrorMessage } from "@/lib/personal-materials/client/errors";
import { formatCreatedAtLabel } from "@/lib/personal-materials/client/validation";

type Props = {
  authorId: string;
  authorSlug: string;
};

export default function AuthorDiagnosticsTemplatesPanel({
  authorId,
  authorSlug,
}: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<AuthorPersonalMaterialTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const createHref = `/author-dashboard/diagnostics/templates/new?author=${encodeURIComponent(authorSlug)}`;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const next = await listAuthorPersonalMaterialTemplates(authorId, controller.signal);
        if (!cancelled) {
          setTemplates(next);
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить шаблоны.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authorId, reloadKey]);

  async function handleInstantiate(templateId: string) {
    setBusyId(templateId);
    try {
      const material = await instantiateAuthorPersonalMaterialTemplate(templateId);
      router.push(
        `/author-dashboard/diagnostics/${material.id}?author=${encodeURIComponent(authorSlug)}`,
      );
    } catch (err) {
      setError(getPersonalMaterialErrorMessage(err));
      setBusyId(null);
    }
  }

  async function handleDuplicate(templateId: string) {
    setBusyId(templateId);
    try {
      await duplicateAuthorPersonalMaterialTemplate(templateId);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setError(getPersonalMaterialErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(templateId: string) {
    if (!window.confirm("Удалить шаблон? Созданные материалы не изменятся.")) {
      return;
    }
    setBusyId(templateId);
    try {
      await deleteAuthorPersonalMaterialTemplate(templateId);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setError(getPersonalMaterialErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-[#7d70a2]">
          Сохраните повторяющиеся тексты и ссылки, чтобы быстрее создавать материалы для
          клиентов.
        </p>
        <Link
          href={createHref}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          Создать шаблон
        </Link>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-[#7d70a2]">Загрузка шаблонов…</p>
      ) : null}

      {!loading && templates.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-[#d8c7ef] bg-[#faf6ff] px-5 py-10 text-center">
          <p className="text-[18px] font-semibold">Пока нет шаблонов</p>
          <p className="mt-3 text-sm text-[#7d70a2]">
            Создайте первый шаблон с общими текстами и ссылкой на чат.
          </p>
          <Link
            href={createHref}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
          >
            Создать первый шаблон
          </Link>
        </div>
      ) : null}

      {!loading && templates.length > 0 ? (
        <div className="mt-6 grid gap-4">
          {templates.map((template) => (
            <article
              key={template.id}
              className="min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4"
            >
              <h3 className="break-words text-[17px] font-semibold">{template.internalName}</h3>
              <p className="mt-1 break-words text-sm text-[#7d70a2]">
                {template.title?.trim() || template.description?.trim() || "Без описания"}
              </p>
              <p className="mt-2 text-xs text-[#7d70a2]">
                Обновлён {formatCreatedAtLabel(template.updatedAt)}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={busyId === template.id}
                  onClick={() => void handleInstantiate(template.id)}
                  className="min-h-11 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Создать из шаблона
                </button>
                <Link
                  href={`/author-dashboard/diagnostics/templates/${template.id}?author=${encodeURIComponent(authorSlug)}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5]"
                >
                  Редактировать
                </Link>
                <details className="rounded-full">
                  <summary className="cursor-pointer list-none rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#5f5484]">
                    ⋯
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={busyId === template.id}
                      onClick={() => void handleDuplicate(template.id)}
                      className="min-h-10 rounded-full border border-[#e4d7f4] px-4 text-sm font-semibold text-[#7042c5]"
                    >
                      Дублировать
                    </button>
                    <button
                      type="button"
                      disabled={busyId === template.id}
                      onClick={() => void handleDelete(template.id)}
                      className="min-h-10 rounded-full border border-[#f0c7c7] px-4 text-sm font-semibold text-[#b42318]"
                    >
                      Удалить
                    </button>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
