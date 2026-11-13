"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  VKUS_ZHIZNI_MEDITATION_QUERIES,
  VKUS_ZHIZNI_MUSIC_QUERIES,
} from "./queries";

type Direction = "music" | "voice";

/** Alphabetical, like the sprint list in the author cabinet. */
const byText = (items: readonly string[]) =>
  [...items].sort((left, right) => left.localeCompare(right, "ru", { sensitivity: "base" }));

const DIRECTIONS: { value: Direction; label: string; items: readonly string[] }[] = [
  { value: "music", label: "Музыка", items: byText(VKUS_ZHIZNI_MUSIC_QUERIES) },
  { value: "voice", label: "Медитации", items: byText(VKUS_ZHIZNI_MEDITATION_QUERIES) },
];

/** How many queries are shown before «Показать все». */
const COLLAPSED_COUNT = 12;

export default function VkusZhizniQueryList({ bookingHref }: { bookingHref: string }) {
  const [direction, setDirection] = useState<Direction>("music");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const current = DIRECTIONS.find((item) => item.value === direction) ?? DIRECTIONS[0];
  const needle = search.trim().toLocaleLowerCase("ru-RU");
  const filtered = useMemo(
    () =>
      needle
        ? current.items.filter((item) => item.toLocaleLowerCase("ru-RU").includes(needle))
        : current.items,
    [current, needle],
  );
  const showAll = expanded || Boolean(needle);
  const visible = showAll ? filtered : filtered.slice(0, COLLAPSED_COUNT);

  return (
    <div
      className="rounded-[24px] border border-[#d7c4f5] bg-[#faf6ff] p-4 sm:p-5"
      data-sprint-queries="approved"
    >
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Направление">
        {DIRECTIONS.map((item) => {
          const active = item.value === direction;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setDirection(item.value);
                setExpanded(false);
              }}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                active
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#e4d7f4] bg-white text-[#7042c5] hover:bg-[#f7f2ff]"
              }`}
            >
              {item.label} ({item.items.length})
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Поиск по запросам</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по запросам"
          className="min-h-11 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm text-[#25135c] placeholder:text-[#9a8fba] focus:border-[#7042c5] focus:outline-none"
        />
      </label>

      {visible.length > 0 ? (
        <ul className="mt-4 grid gap-2 @xl:grid-cols-2" aria-label={`Запросы: ${current.label}`}>
          {visible.map((item) => (
            <li
              key={item}
              className="rounded-[16px] border border-[#eadff8] bg-white px-4 py-3 text-[15px] font-medium leading-6 text-[#25135c] first-letter:uppercase"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#7d70a2]">По этому слову запросов нет.</p>
      )}

      {!showAll && filtered.length > COLLAPSED_COUNT ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 inline-flex min-h-10 items-center rounded-full border border-[#e4d7f4] bg-white px-4 text-sm font-semibold text-[#7042c5] hover:bg-[#f7f2ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Показать все ({filtered.length})
        </button>
      ) : null}

      <div className="mt-5 border-t border-[#e4d7f4] pt-4">
        <p className="text-sm leading-6 text-[#4a3d73]">
          Бронирование – в кабинете автора: до пяти запросов одновременно, каждая
          бронь действует семь дней.
        </p>
        <Link
          href={bookingHref}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-[24px] bg-[#7042c5] px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Забронировать в кабинете автора
        </Link>
      </div>
    </div>
  );
}
