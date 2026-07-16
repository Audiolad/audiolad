"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  ADMIN_ANALYTICS_PERIOD_OPTIONS,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";

export default function AdminAnalyticsPeriodPicker({
  currentPeriod,
}: {
  currentPeriod: AdminAnalyticsPeriod;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex flex-wrap gap-2">
      {ADMIN_ANALYTICS_PERIOD_OPTIONS.map((option) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("period", option.id);
        const href = `${pathname}?${params.toString()}`;
        const isActive = option.id === currentPeriod;

        return (
          <Link
            key={option.id}
            href={href}
            className={
              isActive
                ? "rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white"
                : "rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm font-medium text-[#7042c5]"
            }
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
