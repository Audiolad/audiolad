"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import AuthorProjectCapacityOfferDialog from "@/components/author-dashboard/AuthorProjectCapacityOfferDialog";
import {
  AUTHOR_PROJECT_DESCRIPTION_MAX,
  AUTHOR_PROJECT_NAME_MAX,
} from "@/lib/author-projects/constants";
import { setAuthorProjectCookieClient } from "@/lib/author-projects/selection";
import {
  slugifyAuthorProjectName,
  validateAuthorProjectName,
  validateAuthorProjectSlug,
} from "@/lib/author-projects/slug";

export default function AuthorCreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slugManual, setSlugManual] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);

  const previewSlug = useMemo(() => {
    if (!name.trim()) {
      return "";
    }
    return slugifyAuthorProjectName(name);
  }, [name]);
  const slug = slugManual ?? previewSlug;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const nameError = validateAuthorProjectName(name);
    if (nameError) {
      setError(nameError);
      return;
    }

    const slugError = validateAuthorProjectSlug(slug);
    if (slugError) {
      setError(slugError);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/author/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || null,
          short_description: description.trim() || null,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        project?: { slug: string; id: string; name: string };
        show_capacity_offer?: boolean;
        show_premium_upsell?: boolean;
      };

      if (!response.ok) {
        if (payload.error === "author_project_limit_reached") {
          setOfferOpen(true);
          return;
        }

        if (payload.error === "project_slug_taken") {
          setError("Этот slug уже занят. Выберите другой.");
          return;
        }

        setError(payload.message ?? "Не удалось создать проект.");
        return;
      }

      if (!payload.project?.slug) {
        setError("Не удалось создать проект.");
        return;
      }

      setAuthorProjectCookieClient(payload.project.slug);
      router.replace(
        `/author-dashboard/profile?author=${encodeURIComponent(payload.project.slug)}`,
      );
      router.refresh();
    } catch {
      setError("Не удалось создать проект.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
          <h2 className="text-[18px] font-semibold text-[#25135c]">Создать проект</h2>
          <p className="mt-2 text-sm leading-6 text-[#5f5484]">
            Проект — публичный автор или бренд со своей страницей, продуктами и
            статистикой. Общий аккаунт, заявки и выплаты остаются общими.
          </p>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium">Название</span>
            <input
              value={name}
              maxLength={AUTHOR_PROJECT_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
              placeholder="Например, Аурафон"
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium">Slug публичной страницы</span>
            <input
              value={slug}
              onChange={(event) => {
                setSlugManual(event.target.value.toLowerCase());
              }}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 font-mono text-sm outline-none focus:border-[#9a74d8]"
              placeholder="aurafon"
            />
            <span className="mt-1.5 block text-xs text-[#8a7daf]">
              Страница: /author/{slug || "…"}
            </span>
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium">
              Краткое описание{" "}
              <span className="font-normal text-[#8a7daf]">(необязательно)</span>
            </span>
            <textarea
              value={description}
              maxLength={AUTHOR_PROJECT_DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
              placeholder="Коротко о проекте"
            />
          </label>

          <p className="mt-4 text-sm text-[#7d70a2]">
            Аватар и обложку можно добавить сразу после создания на странице проекта.
          </p>
        </section>

        {error ? (
          <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
        >
          {busy ? "Создаём…" : "Создать проект"}
        </button>
      </form>

      <AuthorProjectCapacityOfferDialog
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        surface="author_create_project_form"
        onPurchaseSucceeded={() => {
          setOfferOpen(false);
        }}
      />
    </>
  );
}
