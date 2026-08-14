"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { buildEditorialDraftSlug } from "@/lib/playlists/editorial-slug";
import {
  PLAYLIST_DESCRIPTION_MAX_LENGTH,
  PLAYLIST_TITLE_MAX_LENGTH,
} from "@/lib/playlists/types";

export default function EditorialPlaylistCreateClient() {
  const router = useRouter();
  const titleId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(buildEditorialDraftSlug(title));
    }
  }, [slugTouched, title]);

  async function submit() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          is_editorial: true,
          description: description.trim() || null,
          slug: slug.trim() || undefined,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        playlist?: { id?: string };
      };

      if (!response.ok) {
        if (data.error === "slug_conflict") {
          setFormError("Такой slug уже занят. Измените его и попробуйте ещё раз.");
          return;
        }

        setFormError(
          data.message || "Не удалось создать плейлист. Попробуйте ещё раз.",
        );
        return;
      }

      if (!data.playlist?.id) {
        setFormError("Не удалось создать плейлист. Попробуйте ещё раз.");
        return;
      }

      router.push(`/editorial/playlists/${data.playlist.id}`);
      router.refresh();
    } catch {
      setFormError("Не удалось создать плейлист. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-5 pb-10 pt-6">
      <Link
        href="/editorial/playlists"
        className="text-sm font-medium text-[#7042c5]"
      >
        ← К открытым плейлистам
      </Link>

      <h1 className="mt-4 text-[28px] font-semibold">Новый открытый плейлист</h1>
      <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
        Плейлист будет создан как черновик Аудиолада. После первой публикации
        slug изменить нельзя.
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="block" htmlFor={titleId}>
          <span className="mb-2 block text-sm font-medium">Название</span>
          <input
            id={titleId}
            value={title}
            maxLength={PLAYLIST_TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
          />
        </label>

        <label className="block" htmlFor={slugId}>
          <span className="mb-2 block text-sm font-medium">Slug</span>
          <input
            id={slugId}
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
          />
          <span className="mt-2 block text-xs leading-5 text-[#7d70a2]">
            После первой публикации slug изменить нельзя.
          </span>
        </label>

        <label className="block" htmlFor={descriptionId}>
          <span className="mb-2 block text-sm font-medium">Описание</span>
          <textarea
            id={descriptionId}
            value={description}
            maxLength={PLAYLIST_DESCRIPTION_MAX_LENGTH}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
          />
          <span className="mt-2 block text-xs text-[#7d70a2]">
            {description.length}/{PLAYLIST_DESCRIPTION_MAX_LENGTH}
          </span>
        </label>

        {formError ? (
          <p className="text-sm text-[#b34f63]" role="alert">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || title.trim().length === 0}
          className="w-full rounded-[18px] bg-[#7042c5] px-4 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto"
        >
          {submitting ? "Создание…" : "Создать плейлист"}
        </button>
      </form>
    </div>
  );
}
