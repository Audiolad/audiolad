"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { buildEditorialDraftSlug } from "@/lib/playlists/editorial-slug";
import type { EditorialDirectionListItem } from "@/lib/playlists/types";
import { EDITORIAL_DIRECTION_NAME_MAX_LENGTH } from "@/lib/playlists/types";

type EditorialDirectionsListClientProps = {
  directions: EditorialDirectionListItem[];
  loadError: boolean;
};

function formatPlaylistCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} плейлист`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} плейлиста`;
  }

  return `${count} плейлистов`;
}

export default function EditorialDirectionsListClient({
  directions,
  loadError,
}: EditorialDirectionsListClientProps) {
  const router = useRouter();
  const nameId = useId();
  const addressId = useId();
  const [name, setName] = useState("");
  const [addressManual, setAddressManual] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const address = addressManual ?? buildEditorialDraftSlug(name);

  async function createDirection() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/editorial/directions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: address.trim(),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        direction?: { id?: string };
      };

      if (!response.ok) {
        if (data.error === "slug_conflict") {
          setFormError("Такой адрес направления уже занят.");
          return;
        }

        setFormError("Не удалось создать направление.");
        return;
      }

      if (!data.direction?.id) {
        setFormError("Не удалось создать направление.");
        return;
      }

      setName("");
      setAddressManual(null);
      router.push(`/editorial/directions/${data.direction.id}`);
      router.refresh();
    } catch {
      setFormError("Не удалось создать направление.");
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

      <h1 className="mt-4 text-[28px] font-semibold">Направления</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[#7d70a2]">
        Направления редакции. Редактор направления видит и ведёт плейлисты
        только своего направления.
      </p>

      <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[21px] font-semibold">Новое направление</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createDirection();
          }}
        >
          <label className="block" htmlFor={nameId}>
            <span className="mb-2 block text-sm font-medium">Название</span>
            <input
              id={nameId}
              value={name}
              maxLength={EDITORIAL_DIRECTION_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
            />
          </label>
          <label className="block" htmlFor={addressId}>
            <span className="mb-2 block text-sm font-medium">
              Адрес направления
            </span>
            <input
              id={addressId}
              value={address}
              onChange={(event) => setAddressManual(event.target.value)}
              className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
            />
          </label>
          {formError ? (
            <p className="text-sm text-[#b34f63]" role="alert">
              {formError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting || name.trim().length === 0}
            className="rounded-[18px] bg-[#7042c5] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Создание…" : "Создать направление"}
          </button>
        </form>
      </section>

      {loadError ? (
        <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
          <p className="text-[16px] font-medium">
            Не удалось загрузить направления. Попробуйте ещё раз.
          </p>
        </section>
      ) : null}

      {!loadError && directions.length === 0 ? (
        <section className="mt-8 rounded-[24px] border border-dashed border-[#d4c2eb] bg-[#faf6ff] px-5 py-10 text-center">
          <p className="text-[18px] font-semibold">Пока нет направлений</p>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Создайте направление, затем назначьте редактора направления.
          </p>
        </section>
      ) : null}

      {!loadError && directions.length > 0 ? (
        <div className="mt-6 space-y-4">
          {directions.map((direction) => {
            const editorNames = direction.editors
              .map((editor) => editor.displayName)
              .join(", ");

            return (
              <article
                key={direction.id}
                className="rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
              >
                <Link
                  href={`/editorial/directions/${direction.id}`}
                  className="block focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  <h2 className="text-[20px] font-semibold">{direction.name}</h2>
                  <p className="mt-2 text-sm text-[#7d70a2]">
                    Редактор направления: {editorNames || "не назначен"}
                  </p>
                  <p className="mt-1 text-sm text-[#7d70a2]">
                    {formatPlaylistCount(direction.playlistCount)}
                  </p>
                </Link>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
