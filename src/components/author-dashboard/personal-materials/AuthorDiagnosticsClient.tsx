"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorDiagnosticsStatusBadge from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsStatusBadge";
import { listAuthorPersonalMaterials } from "@/lib/personal-materials/client/api";
import { getPersonalMaterialListErrorMessage } from "@/lib/personal-materials/client/errors";
import {
  formatCreatedAtLabel,
  formatMaterialDateLabel,
} from "@/lib/personal-materials/client/validation";
import {
  getPersonalMaterialDisplayTitle,
  getPersonalMaterialTypeLabel,
} from "@/lib/personal-materials/client/status-labels";
import type { AuthorPersonalMaterial } from "@/lib/personal-materials/client/types";
import type { AuthorWorkspace } from "@/lib/author-products/types";

type AuthorDiagnosticsClientProps = {
  authors: AuthorWorkspace[];
};

function MaterialCard({
  material,
  authorSlug,
}: {
  material: AuthorPersonalMaterial;
  authorSlug: string;
}) {
  const clientName = `${material.clientFirstName} ${material.clientLastName}`.trim();
  const displayTitle = getPersonalMaterialDisplayTitle(material);

  return (
    <article className="min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start gap-2">
            <h3 className="min-w-0 break-words text-[17px] font-semibold leading-5">
              {clientName}
            </h3>
            <AuthorDiagnosticsStatusBadge material={material} />
          </div>

          <p className="mt-1 break-words text-sm text-[#7d70a2]">
            {getPersonalMaterialTypeLabel(material.materialType)}
            {material.title ? ` · ${displayTitle}` : null}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#5f5484]">
            <span>Дата: {formatMaterialDateLabel(material.materialDate)}</span>
            <span>{material.hasAudio ? "Аудио загружено" : "Без аудио"}</span>
            <span>Создана {formatCreatedAtLabel(material.createdAt)}</span>
            {material.claimed ? <span>Сохранена клиентом</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Link
            href={`/author-dashboard/diagnostics/${material.id}?author=${encodeURIComponent(authorSlug)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
          >
            {material.status === "draft" ? "Продолжить" : "Открыть"}
          </Link>
        </div>
      </div>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-36 animate-pulse rounded-[24px] border border-[#eadff8] bg-[#faf6ff]"
        />
      ))}
    </div>
  );
}

export default function AuthorDiagnosticsClient({ authors }: AuthorDiagnosticsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [materials, setMaterials] = useState<AuthorPersonalMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  useEffect(() => {
    if (!selectedAuthor) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadMaterialsEffect() {
      setLoading(true);
      setError(null);

      try {
        const nextMaterials = await listAuthorPersonalMaterials(
          selectedAuthor.id,
          controller.signal,
        );

        if (!cancelled) {
          setMaterials(nextMaterials);
        }
      } catch {
        if (!cancelled) {
          setError(getPersonalMaterialListErrorMessage());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMaterialsEffect();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedAuthor, refreshToken]);

  function handleAuthorChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("author", slug);
    router.replace(`/author-dashboard/diagnostics?${params.toString()}`);
  }

  if (!selectedAuthor) {
    return (
      <div className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
        <p className="text-[18px] font-semibold">Авторское пространство недоступно</p>
        <p className="mt-3 text-sm text-[#7d70a2]">
          Выберите другое пространство или вернитесь в профиль.
        </p>
      </div>
    );
  }

  const createHref = `/author-dashboard/diagnostics/new?author=${encodeURIComponent(selectedAuthor.slug)}`;

  return (
    <div className="min-w-0">
      <AuthorDashboardNav authorSlug={selectedAuthor.slug} />

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Авторское пространство
          </span>
          <select
            value={selectedAuthor.slug}
            onChange={(event) => handleAuthorChange(event.target.value)}
            className="w-full min-w-0 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]"
          >
            {authors.map((author) => (
              <option key={author.id} value={author.slug}>
                {author.name}
              </option>
            ))}
          </select>
        </label>

        <Link
          href={createHref}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          Создать личный материал
        </Link>
      </div>

      <p className="mt-6 text-sm leading-6 text-[#7d70a2]">
        Создавайте персональные аудиоразборы, медитации и другие материалы для
        отдельных клиентов.
      </p>

      <div className="mt-6 min-w-0">
        {loading ? <LoadingSkeleton /> : null}

        {!loading && error ? (
          <div className="rounded-[24px] border border-[#f3d9d9] bg-[#fff7f7] px-5 py-6">
            <p className="text-sm text-[#8b2f2f]">{error}</p>
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              className="mt-4 min-h-11 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
            >
              Повторить
            </button>
          </div>
        ) : null}

        {!loading && !error && materials.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#d8c7ef] bg-[#faf6ff] px-5 py-10 text-center">
            <p className="text-[18px] font-semibold">Пока нет личных материалов</p>
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Здесь появятся персональные материалы, которые вы создадите для клиентов.
            </p>
            <Link
              href={createHref}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              Создать личный материал
            </Link>
          </div>
        ) : null}

        {!loading && !error && materials.length > 0 ? (
          <div className="grid min-w-0 gap-4">
            {materials.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                authorSlug={selectedAuthor.slug}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
