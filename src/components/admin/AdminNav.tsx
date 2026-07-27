"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminNavLink = {
  href: string;
  label: string;
  badgeCount?: number;
  matchPrefixes?: string[];
};

type AdminNavProps = {
  items: AdminNavLink[];
};

export default function AdminNav({ items }: AdminNavProps) {
  const pathname = usePathname();

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Панель управления">
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badgeCount =
          typeof item.badgeCount === "number" && item.badgeCount > 0
            ? item.badgeCount
            : null;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
              active
                ? "bg-[#7042c5] text-white"
                : "border border-[#e4d7f4] bg-white text-[#7042c5]"
            }`}
          >
            <span className="truncate">{item.label}</span>
            {badgeCount !== null ? (
              <span
                className={`inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
                  active
                    ? "bg-white text-[#7042c5]"
                    : "bg-[#7042c5] text-white"
                }`}
                aria-label={`Новых: ${badgeCount}`}
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
