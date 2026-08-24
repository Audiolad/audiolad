"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import PrivateAudioCard from "@/components/private-audio/PrivateAudioCard";
import {
  getLibraryFilterEmptyCta,
  getLibraryFilterEmptyMessage,
  isLibraryFilterId,
  matchesLibraryFilter,
  type LibraryFilterId,
} from "@/lib/library/filters";
import type { PrivateAudioListItemDto } from "@/lib/private-audio/types";

import LibraryCard, { type LibraryCardItem } from "./LibraryCard";

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
  items: LibraryCardItem[];
  error: boolean;
  purchasedSlug?: string | null;
  initialPrivateItems?: PrivateAudioListItemDto[];
  privateError?: boolean;
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

export default function MyPracticesLibrary({
  items,
  error,
  purchasedSlug = null,
  initialPrivateItems = [],
  privateError = false,
}: MyPracticesLibraryProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterFromQuery = searchParams.get("filter");
  const activeFilter: LibraryFilterId = isLibraryFilterId(filterFromQuery)
    ? filterFromQuery
    : "all";

  const [catalogItems, setCatalogItems] = useState(items);
  const [itemsSource, setItemsSource] = useState(items);
  const [leavingPracticeIds, setLeavingPracticeIds] = useState<Set<string>>(
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
  const privateItems = initialPrivateItems;

  if (items !== itemsSource) {
    setItemsSource(items);
    setCatalogItems(items);
    setLeavingPracticeIds(new Set());
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

  function handleRemovedFromLibrary(practiceId: string) {
    setLeavingPracticeIds((prev) => {
      const next = new Set(prev);
      next.add(practiceId);
      return next;
    });
    pendingLibraryRemoveToast = "Удалено из Аудиотеки";
    pendingLibraryRemoveToastUntil = Date.now() + 2800;
    setToast(pendingLibraryRemoveToast);

    window.setTimeout(() => {
      setCatalogItems((prev) =>
        prev.filter((item) => item.practice?.id !== practiceId),
      );
      setLeavingPracticeIds((prev) => {
        const next = new Set(prev);
        next.delete(practiceId);
        return next;
      });
    }, 200);
  }

  const normalizedPurchasedSlug = purchasedSlug?.trim().toLowerCase() ?? null;
  const purchasedItem = normalizedPurchasedSlug
    ? catalogItems.find(
        (item) => item.practice?.slug === normalizedPurchasedSlug,
      )
    : null;

  const filteredItems = useMemo(
    () =>
      catalogItems.filter((item) => matchesLibraryFilter(item, activeFilter)),
    [activeFilter, catalogItems],
  );

  type AllLibraryEntry =
    | { kind: "catalog"; sortAt: number; item: LibraryCardItem }
    | { kind: "private_audio"; sortAt: number; item: PrivateAudioListItemDto };

  const allEntries = useMemo(() => {
    if (activeFilter !== "all") {
      return [] as AllLibraryEntry[];
    }

    const catalogEntries: AllLibraryEntry[] = filteredItems.map((item) => {
      const sortSource = item.grantedAt ?? item.practice?.updatedAt ?? null;
      const sortAt = sortSource ? Date.parse(sortSource) : 0;

      return {
        kind: "catalog" as const,
        sortAt: Number.isFinite(sortAt) ? sortAt : 0,
        item,
      };
    });

    const privateEntries: AllLibraryEntry[] = privateItems.map((item) => {
      const sortAt = Date.parse(item.createdAt);

      return {
        kind: "private_audio" as const,
        sortAt: Number.isFinite(sortAt) ? sortAt : 0,
        item,
      };
    });

    return [...catalogEntries, ...privateEntries].sort(
      (left, right) => right.sortAt - left.sortAt,
    );
  }, [activeFilter, filteredItems, privateItems]);

  const allCount = filteredItems.length + privateItems.length;
  const libraryIsEmpty =
    catalogItems.length === 0 && privateItems.length === 0 && !privateError;

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

  return (
    <>
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
              ? `В загрузках: ${formatUploadsCount(privateItems.length)}`
              : activeFilter === "all"
                ? `В библиотеке: ${formatPracticesCount(allCount)}`
                : `В библиотеке: ${formatPracticesCount(filteredItems.length)}`}
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

        {showingUploads ? (
          privateError ? (
            <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
              <p className="text-[17px] font-semibold">
                Не удалось загрузить материалы
              </p>
              <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                Попробуйте обновить страницу.
              </p>
            </div>
          ) : privateItems.length === 0 ? (
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
          ) : (
            <div className="mt-5 space-y-4">
              {privateItems.map((item) => (
                <PrivateAudioCard key={item.id} item={item} />
              ))}
            </div>
          )
        ) : error && activeFilter !== "all" ? (
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
        ) : activeFilter !== "all" &&
          (libraryIsEmpty || filteredItems.length === 0) ? (
          <LibraryFilterEmpty
            filter={activeFilter}
            onShowAll={() => selectFilter("all")}
          />
        ) : libraryIsEmpty ? (
          <LibraryFilterEmpty filter="all" />
        ) : activeFilter === "all" ? (
          error && privateItems.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
              <p className="text-[17px] font-semibold">
                Не удалось загрузить библиотеку
              </p>
              <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                Попробуйте обновить страницу.
              </p>
            </div>
          ) : allEntries.length === 0 ? (
            <LibraryFilterEmpty filter="all" />
          ) : (
            <div className="mt-5 space-y-4">
              {allEntries.map((entry, index) =>
                entry.kind === "private_audio" ? (
                  <PrivateAudioCard
                    key={`private-${entry.item.id}`}
                    item={entry.item}
                  />
                ) : (
                  <LibraryCard
                    key={`catalog-${entry.item.id}`}
                    item={entry.item}
                    index={index}
                    isAuthenticated
                    signInReturnPath="/my-practices"
                    leaving={
                      entry.item.practice?.id
                        ? leavingPracticeIds.has(entry.item.practice.id)
                        : false
                    }
                    onRemovedFromLibrary={handleRemovedFromLibrary}
                    highlighted={
                      normalizedPurchasedSlug !== null &&
                      entry.item.practice?.slug === normalizedPurchasedSlug
                    }
                  />
                ),
              )}
            </div>
          )
        ) : (
          <div className="mt-5 space-y-4">
            {filteredItems.map((item, index) => (
              <LibraryCard
                key={item.id}
                item={item}
                index={index}
                isAuthenticated
                signInReturnPath="/my-practices"
                leaving={
                  item.practice?.id
                    ? leavingPracticeIds.has(item.practice.id)
                    : false
                }
                onRemovedFromLibrary={handleRemovedFromLibrary}
                highlighted={
                  normalizedPurchasedSlug !== null &&
                  item.practice?.slug === normalizedPurchasedSlug
                }
              />
            ))}
          </div>
        )}
      </section>

      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
          style={{
            bottom:
              "calc(var(--global-mini-player-height, 0px) + var(--bottom-nav-offset, 96px) + env(safe-area-inset-bottom, 0px) + 0.75rem)",
          }}
          role="status"
        >
          <p className="rounded-full bg-[#25135c] px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </>
  );
}
