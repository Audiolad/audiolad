"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import type { AdminAnalyticsFilterOption } from "@/lib/admin/analytics-queries";
import type { AdminAnalyticsPeriod } from "@/lib/admin/analytics-period";

export default function AdminAnalyticsFilters({
  currentPeriod,
  includeTest,
  authorId,
  practiceId,
  utmSource,
  deviceType,
  authors,
  practices,
  filterNotes,
}: {
  currentPeriod: AdminAnalyticsPeriod;
  includeTest: boolean;
  authorId: string | null;
  practiceId: string | null;
  utmSource: string | null;
  deviceType: string | null;
  authors: AdminAnalyticsFilterOption[];
  practices: AdminAnalyticsFilterOption[];
  filterNotes: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function buildHref(mutate: (params: URLSearchParams) => void): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", currentPeriod);
    params.set("includeTest", includeTest ? "1" : "0");
    mutate(params);
    return `${pathname}?${params.toString()}`;
  }

  function onSelectChange(
    key: "authorId" | "practiceId" | "utmSource" | "deviceType",
    value: string,
  ) {
    startTransition(() => {
      router.push(
        buildHref((params) => {
          if (!value) {
            params.delete(key);
          } else {
            params.set(key, value);
          }
          params.delete("practicesPage");
          params.delete("authorsPage");
          params.delete("acquisitionPage");
        }),
      );
    });
  }

  const resetHref = buildHref((params) => {
    params.delete("authorId");
    params.delete("practiceId");
    params.delete("utmSource");
    params.delete("deviceType");
    params.delete("practicesPage");
    params.delete("authorsPage");
    params.delete("acquisitionPage");
  });

  return (
    <div className="rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#25135c]">Фильтры отчёта</p>
        {(authorId || practiceId || utmSource || deviceType) && (
          <Link href={resetHref} className="text-xs font-medium text-[#7042c5]">
            Сбросить фильтры
          </Link>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-xs text-[#796ba0]">
          Автор
          <select
            className="mt-1 w-full rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm text-[#25135c]"
            value={authorId ?? ""}
            disabled={pending}
            onChange={(event) => onSelectChange("authorId", event.target.value)}
          >
            <option value="">Все авторы</option>
            {authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-[#796ba0]">
          Практика
          <select
            className="mt-1 w-full rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm text-[#25135c]"
            value={practiceId ?? ""}
            disabled={pending}
            onChange={(event) => onSelectChange("practiceId", event.target.value)}
          >
            <option value="">Все практики</option>
            {practices.map((practice) => (
              <option key={practice.id} value={practice.id}>
                {practice.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-[#796ba0]">
          UTM source
          <select
            className="mt-1 w-full rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm text-[#25135c]"
            value={utmSource ?? ""}
            disabled={pending}
            onChange={(event) => onSelectChange("utmSource", event.target.value)}
          >
            <option value="">Все источники</option>
            <option value="__none__">Без UTM / неопределённые</option>
            <option value="max">max</option>
            <option value="telegram">telegram</option>
            <option value="vk">vk</option>
            <option value="yandex">yandex</option>
            <option value="google">google</option>
          </select>
        </label>

        <label className="block text-xs text-[#796ba0]">
          Устройство
          <select
            className="mt-1 w-full rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm text-[#25135c]"
            value={deviceType ?? ""}
            disabled={pending}
            onChange={(event) => onSelectChange("deviceType", event.target.value)}
          >
            <option value="">Все устройства</option>
            <option value="mobile">mobile</option>
            <option value="tablet">tablet</option>
            <option value="desktop">desktop</option>
          </select>
        </label>
      </div>

      {filterNotes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs leading-5 text-[#796ba0]">
          {filterNotes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
