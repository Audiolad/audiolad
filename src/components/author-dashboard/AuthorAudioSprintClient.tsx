"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import AuthorSeoPromptBuilder from "@/components/author-dashboard/AuthorSeoPromptBuilder";
import {
  AUDIO_SPRINT_AUTHOR_GROUPS,
  AUDIO_SPRINT_GROUP_LABEL,
  AUDIO_SPRINT_OSEN_ZVUCHIT_DESCRIPTION,
  audioSprintPublicationClass,
  audioSprintReserveConflictLifecycle,
  buildAudioSprintProductCreateHref,
  canReserveAudioSprintQuery,
  isAudioSprintPoolVisible,
  sortAudioSprintQueriesByCanonicalText,
  type AudioSprintAuthorGroup,
  type AudioSprintQueryCard,
} from "@/lib/seo-queries/audio-sprint";
import {
  lifecycleLabel,
  nextActiveReservationCountAfterReserve,
  SEO_ACTIVE_RESERVATION_LIMIT,
} from "@/lib/seo-queries/types";

type Props = {
  authorId: string;
  authorSlug: string;
  queries: AudioSprintQueryCard[];
  activeReservationCount: number;
};

function formatUntil(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function AuthorAudioSprintClient({
  authorId,
  authorSlug,
  queries,
  activeReservationCount,
}: Props) {
  const router = useRouter();
  const [group, setGroup] = useState<AudioSprintAuthorGroup>("music");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(queries);
  const [activeCount, setActiveCount] = useState(activeReservationCount);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => isAudioSprintPoolVisible(item.pool)),
    [items],
  );

  const sectionItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    return sortAudioSprintQueriesByCanonicalText(
      visibleItems.filter((item) => {
        if (item.authorGroup !== group) return false;
        if (!needle) return true;
        return item.queryText.toLocaleLowerCase("ru-RU").includes(needle);
      }),
    );
  }, [group, search, visibleItems]);

  async function reserve(item: AudioSprintQueryCard) {
    setPendingId(item.id);
    setMessage(null);
    const response = await fetch("/api/author/seo-reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        author_id: authorId,
        query_id: item.id,
        publication_class: audioSprintPublicationClass(item.authorGroup),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
      error?: string;
      reservation?: { id?: string; expires_at?: string | null };
    };
    setPendingId(null);
    if (!response.ok || !payload.reservation?.id) {
      const code =
        typeof payload.code === "string" && payload.code.trim()
          ? payload.code.trim()
          : typeof payload.error === "string"
            ? payload.error.trim()
            : "";
      const occupiedLifecycle = audioSprintReserveConflictLifecycle(code);
      if (occupiedLifecycle) {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  lifecycle: occupiedLifecycle,
                  reservationId: null,
                  expiresAt: null,
                  productId: null,
                }
              : entry,
          ),
        );
        router.refresh();
      }
      setMessage(
        typeof payload.message === "string" && payload.message.trim()
          ? payload.message
          : "Не удалось забронировать запрос.",
      );
      return;
    }
    const reservationId = payload.reservation.id;
    const expiresAt =
      typeof payload.reservation.expires_at === "string"
        ? payload.reservation.expires_at
        : null;
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              reservationId,
              expiresAt,
              lifecycle: "in_progress" as const,
            }
          : entry,
      ),
    );
    setActiveCount((current) => nextActiveReservationCountAfterReserve(current, true));
    setMessage("Запрос закреплен за вами");
  }

  return (
    <div className="space-y-5" data-testid="audio-sprint-osen-zvuchit">
      <section className="rounded-[24px] border border-[#d7c4f5] bg-[#faf6ff] p-5">
        <p className="text-sm leading-6 text-[#4c3d78]">
          {AUDIO_SPRINT_OSEN_ZVUCHIT_DESCRIPTION}
        </p>
        <p className="mt-3 text-sm font-semibold text-[#25135c]">
          Мои запросы: {activeCount} из {SEO_ACTIVE_RESERVATION_LIMIT}
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Разделы спринта">
          {AUDIO_SPRINT_AUTHOR_GROUPS.map((value) => {
            const count = visibleItems.filter((item) => item.authorGroup === value).length;
            const selected = group === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setGroup(value)}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${
                  selected
                    ? "bg-[#7042c5] text-white"
                    : "border border-[#e4d7f4] bg-white text-[#7042c5]"
                }`}
              >
                {AUDIO_SPRINT_GROUP_LABEL[value]} ({count})
              </button>
            );
          })}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по запросам"
          className="mt-4 min-h-11 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm outline-none focus:border-[#7042c5]"
        />
        {message ? (
          <p role="status" className="mt-3 text-sm font-medium text-[#4c3d78]">
            {message}
          </p>
        ) : null}
      </section>

      {sectionItems.length === 0 ? (
        <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center text-sm text-[#796ba0]">
          В этом разделе нет подходящих запросов.
        </div>
      ) : (
        <div className="grid gap-4">
          {sectionItems.map((item) => {
            const own = Boolean(item.reservationId);
            const reservedInOtherWorkspace =
              item.reservedByCurrentUser && !own && Boolean(item.reservationWorkspaceSlug);
            const until = formatUntil(item.expiresAt);
            const reserveEnabled = canReserveAudioSprintQuery({
              lifecycle: item.lifecycle,
              isOwnReservation: own || item.reservedByCurrentUser,
              activeReservationCount: activeCount,
            });
            const related = visibleItems
              .filter((candidate) => candidate.authorGroup === item.authorGroup)
              .map((candidate) => ({
                id: candidate.id,
                queryText: candidate.queryText,
              }));
            return (
              <article
                key={item.id}
                className="rounded-[22px] border border-[#eadff8] bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-[#25135c]">{item.queryText}</h2>
                  <span className="rounded-full bg-[#f7f2ff] px-3 py-1 text-xs font-semibold text-[#7042c5]">
                    {item.reservedByCurrentUser && item.lifecycle === "in_progress"
                      ? "Забронирован вами"
                      : item.lifecycle === "in_progress"
                        ? "Забронирован"
                        : lifecycleLabel(item.lifecycle)}
                  </span>
                </div>
                {own ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {until ? (
                      <span className="text-sm text-[#5f5484]">До {until}</span>
                    ) : null}
                    {item.productId ? (
                      <Link
                        href={`/author-dashboard/products/${item.productId}`}
                        className="text-sm font-semibold text-[#7042c5]"
                      >
                        Открыть продукт
                      </Link>
                    ) : item.reservationId ? (
                      <Link
                        href={buildAudioSprintProductCreateHref({
                          authorSlug,
                          reservationId: item.reservationId,
                          authorGroup: item.authorGroup,
                        })}
                        className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
                      >
                        Создать продукт по этому запросу
                      </Link>
                    ) : null}
                  </div>
                ) : reservedInOtherWorkspace ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-[#5f5484]">
                      Забронирован в пространстве «{item.reservationWorkspaceName || "другой артист"}»
                    </span>
                    <Link
                      href={`/author-dashboard/audio-sprints/osen-zvuchit-2026?author=${encodeURIComponent(
                        item.reservationWorkspaceSlug!,
                      )}`}
                      className="text-sm font-semibold text-[#7042c5]"
                    >
                      Открыть это пространство
                    </Link>
                  </div>
                ) : item.lifecycle === "available" ? (
                  <button
                    type="button"
                    disabled={!reserveEnabled || pendingId === item.id}
                    onClick={() => void reserve(item)}
                    className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Забронировать
                  </button>
                ) : null}
                {own && item.lifecycle !== "published" && item.reservationId ? (
                  <AuthorSeoPromptBuilder
                    primaryQueryText={item.queryText}
                    primaryQueryId={item.id}
                    analyzedOpportunities={related}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
