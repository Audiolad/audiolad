"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { AdminAnalyticsPeriod } from "@/lib/admin/analytics-period";

type AdminAnalyticsTestTrafficControlsProps = {
  currentPeriod: AdminAnalyticsPeriod;
  includeTest: boolean;
  excludedTestVisitors: number;
  excludedTestSessions: number;
};

export default function AdminAnalyticsTestTrafficControls({
  currentPeriod,
  includeTest,
  excludedTestVisitors,
  excludedTestSessions,
}: AdminAnalyticsTestTrafficControlsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = new URLSearchParams(searchParams.toString());
  params.set("period", currentPeriod);
  params.set("includeTest", includeTest ? "0" : "1");
  const toggleHref = `${pathname}?${params.toString()}`;

  const showExcluded =
    !includeTest && (excludedTestVisitors > 0 || excludedTestSessions > 0);

  return (
    <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
      <Link
        href={toggleHref}
        className="inline-flex items-center gap-2 rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm font-medium text-[#7042c5]"
        aria-pressed={!includeTest}
      >
        <span
          className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition ${
            includeTest ? "bg-[#d8c9ef]" : "bg-[#7042c5]"
          }`}
          aria-hidden
        >
          <span
            className={`h-4 w-4 rounded-full bg-white transition ${
              includeTest ? "translate-x-0" : "translate-x-4"
            }`}
          />
        </span>
        Не учитывать тестовый трафик
      </Link>

      {showExcluded ? (
        <p className="text-right text-xs leading-5 text-[#796ba0]">
          Исключено тестовых посетителей: {excludedTestVisitors.toLocaleString("ru-RU")}
          {excludedTestSessions > 0
            ? ` · сессий: ${excludedTestSessions.toLocaleString("ru-RU")}`
            : null}
        </p>
      ) : null}
    </div>
  );
}
