"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import LibraryCatalogTile from "@/components/my-practices/LibraryCatalogTile";
import LibraryOwnedCard from "@/components/my-practices/LibraryOwnedCard";
import PlaylistCard from "@/components/playlists/catalog/PlaylistCard";
import {
  getLibraryFilterEmptyCta,
  getLibraryFilterEmptyMessage,
  isLibraryFilterId,
  type LibraryFilterId,
} from "@/lib/library/filters";
import { matchesUnifiedLibraryFilter } from "@/lib/library/unified-filter";
import { unifiedPlaylistEntryToListingItem } from "@/lib/library/unified-playlist-item";
import type { UnifiedLibraryEntry } from "@/lib/library/unified-entry";
import { platformBottomContentPaddingClass } from "@/lib/navigation/bottom-nav";

type LibraryFilter = {
  id: LibraryFilterId;
  label: string;
};

const FILTERS: LibraryFilter[] = [
  { id: "all", label: "Все" },
  { id: "saved", label: "Сохранённые" },
  { id: "gifts", label: "Подарки" },
  { id: "purchased", label: "Купленные" },
  { id: "uploads", label: "Мои записи" },
];

/** Survives Suspense/remount so remove confirmation is not lost mid-animation. */
let pendingLibraryRemoveToast: string | null = null;
let pendingLibraryRemoveToastUntil = 0;

type MyPracticesLibraryProps = {
  entries: UnifiedLibraryEntry[];
  error: boolean;
  purchasedSlug?: string | null;
};

function formatPracticesCount(count: number): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  let word = "практик";

  if (mod10 === 1 && mod100 !== 11) {
    word = "практика";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "практики";
  }

  return `${count} ${word}`;
}

function formatUploadsCount(count: number): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  let word = "материалов";

  if (mod10 === 1 && mod100 !== 11) {
    word = "материал";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "материала";
  }

  return `${count} ${word}`;
}

function LibraryFilterEmpty({
  filter,
  onShowAll,
}: {
  filter: LibraryFilterId;
  onShowAll?: () => void;
}) {
  const cta = getLibraryFilterEmptyCta(filter);
  const showAddAudio = filter === "all";

  return (
    <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
      <p className="text-[17px] font-semibold">
        {filter === "all" ? "В Аудиотеке пока пусто" : "Пока пусто"}
      </p>
      <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
        {getLibraryFilterEmptyMessage(filter)}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {cta ? (
          <Link
            href={cta.href}
            className="inline-block rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
          >
            {cta.label}
          </Link>
        ) : onShowAll ? (
          <button
            type="button"
            onClick={onShowAll}
            className="mt-0 text-sm font-medium text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Показать все материалы
          </button>
        ) : null}
        {showAddAudio ? (
          <Link
            href="/my-library/private-audio/new"
            className="inline-block rounded-[18px] border border-[#d9c7f4] bg-white px-5 py-3 text-sm font-semibold text-[#7042c5]"
          >
            Добавить своё аудио
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function LibraryFeedTile({
  entry,
  leaving,
  highlighted,
  onRemovedFromLibrary,
}: {
  entry: UnifiedLibraryEntry;
  leaving: boolean;
  highlighted: boolean;
  onRemovedFromLibrary: (entryId: string, options?: { keepIfEntitled?: boolean }) => void;
}) {
  const tileClassName = `h-full min-w-0 transition-opacity duration-200 ${
    leaving ? "pointer-events-none opacity-0" : "opacity-100"
  }`;

  if (entry.kind === "catalog") {
    return (
      <li className={tileClassName}>
        <LibraryCatalogTile
          entry={entry}
          highlighted={highlighted}
          onHeartSavedChange={(saved) => {
            if (!saved) {
              onRemovedFromLibrary(entry.id, { keepIfEntitled: true });
            }
          }}
        />
      </li>
    );
  }

  if (entry.kind === "playlist") {
    return (
      <li className={tileClassName}>
        <PlaylistCard
          item={unifiedPlaylistEntryToListingItem(entry)}
          isAuthenticated
          signInReturnPath="/my-practices"
          onViewerSavedChange={(saved) => {
            if (!saved) {
              onRemovedFromLibrary(entry.id);
            }
          }}
        />
      </li>
    );
  }

  if (entry.kind === "private_audio" || entry.kind === "personal") {
    return (
      <li className={tileClassName}>
        <LibraryOwnedCard entry={entry} />
      </li>
    );
  }

  return null;
}

export default function MyPracticesLibrary({
  entries,
  error,
  purchasedSlug = null,
}: MyPracticesLibraryProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterFromQuery = searchParams.get("filter");
  const activeFilter: LibraryFilterId = isLibraryFilterId(filterFromQuery)
    ? filterFromQuery
    : "all";

  const [visibleEntries, setVisibleEntries] = useState(entries);
  const [entriesSource, setEntriesSource] = useState(entries);
  const [leavingEntryIds, setLeavingEntryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [toast, setToast] = useState<string | null>(() => {
    if (
      pendingLibraryRemoveToast &&
      pendingLibraryRemoveToastUntil > Date.now()
    ) {
      return pendingLibraryRemoveToast;
    }

    return null;
  });

  if (entries !== entriesSource) {
    setEntriesSource(entries);
    setVisibleEntries(entries);
    setLeavingEntryIds(new Set());
  }

  useEffect(() => {
    if (!toast) {
      return;
    }

    const remaining = Math.max(0, pendingLibraryRemoveToastUntil - Date.now());
    const timer = window.setTimeout(() => {
      pendingLibraryRemoveToast = null;
      pendingLibraryRemoveToastUntil = 0;
      setToast(null);
    }, remaining || 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function handleRemovedFromLibrary(
    entryId: string,
    options?: { keepIfEntitled?: boolean },
  ) {
    const current = visibleEntries.find((entry) => entry.id === entryId);
    const keepEntitled =
      options?.keepIfEntitled === true &&
      current?.kind === "catalog" &&
      current.canListen;

    if (keepEntitled) {
      setVisibleEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId && entry.kind === "catalog"
            ? { ...entry, isSaved: false }
            : entry,
        ),
      );
      return;
    }

    setLeavingEntryIds((prev) => {
      const next = new Set(prev);
      next.add(entryId);
      return next;
    });
    pendingLibraryRemoveToast = "Удалено из Аудиотеки";
    pendingLibraryRemoveToastUntil = Date.now() + 2800;
    setToast(pendingLibraryRemoveToast);

    window.setTimeout(() => {
      setVisibleEntries((prev) =>
        prev.filter((entry) => entry.id !== entryId),
      );
      setLeavingEntryIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }, 200);
  }

  const normalizedPurchasedSlug = purchasedSlug?.trim().toLowerCase() ?? null;
  const purchasedItem = normalizedPurchasedSlug
    ? visibleEntries.find(
        (entry) =>
          entry.kind === "catalog" &&
          entry.practice?.slug === normalizedPurchasedSlug,
      )
    : null;

  const filteredEntries = useMemo(
    () =>
      visibleEntries.filter((entry) =>
        matchesUnifiedLibraryFilter(entry, activeFilter),
      ),
    [activeFilter, visibleEntries],
  );

  const privateCount = visibleEntries.filter(
    (entry) => entry.kind === "private_audio",
  ).length;
  const libraryIsEmpty = visibleEntries.length === 0;

  function selectFilter(filter: LibraryFilterId) {
    const params = new URLSearchParams(searchParams.toString());

    if (filter === "all") {
      params.delete("filter");
    } else {
      params.set("filter", filter);
    }

    const query = params.toString();
    router.replace(query ? `/my-practices?${query}` : "/my-practices", {
      scroll: false,
    });
  }

  const showingUploads = activeFilter === "uploads";
  const showLibraryError = libraryIsEmpty && error;
  const showUploadsError = showingUploads && privateCount === 0 && error;

  return (
    <div className={platformBottomContentPaddingClass}>
      {purchasedItem ? (
        <div
          role="status"
          className="mt-6 rounded-[18px] border border-[#d9c7f4] bg-[#f8f3ff] px-4 py-3 text-center text-sm leading-5 text-[#5f4a8f]"
        >
          Практика добавлена в Аудиотеку
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/my-library/private-audio/new"
          className="inline-flex min-h-11 items-center justify-center rounded-[16px] border border-[#d9c7f4] bg-white px-4 text-sm font-semibold text-[#7042c5] hover:bg-[#faf6ff]"
        >
          Добавить своё аудио
        </Link>
      </div>

      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-2">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.id;

          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => selectFilter(filter.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                isActive
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#e2d7f2] bg-white text-[#25135c] hover:border-[#c9b5e8]"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#7d70a2]">
            {showingUploads
              ? `В загрузках: ${formatUploadsCount(privateCount)}`
              : `В библиотеке: ${formatPracticesCount(filteredEntries.length)}`}
          </p>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className="text-sm font-medium text-[#7042c5] opacity-60"
          >
            Сначала новые⌄
          </button>
        </div>

        {showUploadsError ? (
          <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
            <p className="text-[17px] font-semibold">
              Не удалось загрузить материалы
            </p>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              Попробуйте обновить страницу.
            </p>
          </div>
        ) : showingUploads && privateCount === 0 ? (
          <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
            <p className="text-[17px] font-semibold">Пока нет загрузок</p>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              {getLibraryFilterEmptyMessage("uploads")}
            </p>
            <Link
              href="/my-library/private-audio/new"
              className="mt-4 inline-block rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              Добавить своё аудио
            </Link>
          </div>
        ) : showLibraryError ? (
          <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
            <p className="text-[17px] font-semibold">
              Не удалось загрузить библиотеку
            </p>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              Попробуйте обновить страницу.
            </p>
            <Link
              href="/my-practices"
              className="mt-4 inline-block text-sm font-medium text-[#7042c5]"
            >
              Обновить
            </Link>
          </div>
        ) : filteredEntries.length === 0 ? (
          <LibraryFilterEmpty
            filter={activeFilter}
            onShowAll={
              activeFilter === "all" ? undefined : () => selectFilter("all")
            }
          />
        ) : (
          <div className="listener-library-grid mt-5">
            <ul
              data-library-product-grid
              className="catalog-product-grid"
            >
              {filteredEntries.map((entry) => (
                <LibraryFeedTile
                  key={entry.id}
                  entry={entry}
                  leaving={leavingEntryIds.has(entry.id)}
                  highlighted={
                    entry.kind === "catalog" &&
                    normalizedPurchasedSlug !== null &&
                    entry.practice?.slug === normalizedPurchasedSlug
                  }
                  onRemovedFromLibrary={handleRemovedFromLibrary}
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
          style={{
            bottom: "calc(var(--platform-bottom-chrome) + 0.75rem)",
          }}
          role="status"
        >
          <p className="rounded-full bg-[#25135c] px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </div>
  );
}
