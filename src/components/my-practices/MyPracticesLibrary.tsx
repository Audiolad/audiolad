"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import {
  getLibraryFilterEmptyMessage,
  matchesLibraryFilter,
  type LibraryFilterId,
} from "@/lib/library/filters";

import LibraryCard, { type LibraryCardItem } from "./LibraryCard";

type LibraryFilter = {
  id: LibraryFilterId;
  label: string;
};

const FILTERS: LibraryFilter[] = [
  { id: "all", label: "Все" },
  { id: "purchased", label: "Купленные" },
  { id: "gifts", label: "Подарки" },
  { id: "downloaded", label: "Скачанные" },
];

type MyPracticesLibraryProps = {
  items: LibraryCardItem[];
  error: boolean;
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

export default function MyPracticesLibrary({
  items,
  error,
}: MyPracticesLibraryProps) {
  const [activeFilter, setActiveFilter] = useState<LibraryFilterId>("all");

  const filteredItems = useMemo(
    () => items.filter((item) => matchesLibraryFilter(item, activeFilter)),
    [activeFilter, items],
  );

  return (
    <>
      <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-2">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.id;

          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveFilter(filter.id)}
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
            В библиотеке: {formatPracticesCount(filteredItems.length)}
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

        {error ? (
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
        ) : items.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
            <p className="text-[17px] font-semibold">
              В вашей библиотеке пока нет практик
            </p>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              Выберите практику в подарок или найдите подходящий материал в
              каталоге.
            </p>
            <Link
              href="/catalog"
              className="mt-4 inline-block rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              Перейти в каталог
            </Link>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
            <p className="text-[17px] font-semibold">
              {activeFilter === "downloaded"
                ? "Скачанных материалов пока нет"
                : "Пока пусто"}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              {getLibraryFilterEmptyMessage(activeFilter)}
            </p>
            {activeFilter !== "all" ? (
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className="mt-4 text-sm font-medium text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Показать все материалы
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {filteredItems.map((item, index) => (
              <LibraryCard key={item.id} item={item} index={index} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
