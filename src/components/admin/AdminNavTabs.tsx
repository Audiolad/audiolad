import Link from "next/link";

import { formatAdminNavBadgeCount, type AdminNavBadgeTone } from "@/lib/admin/nav-badge";
import { isAdminNavPathActive } from "@/lib/admin/nav-active";

export type AdminNavLink = {
  href: string;
  label: string;
  badgeCount?: number;
  /** "attention" = orange badge + orange-tinted tab while the count is > 0. */
  badgeTone?: AdminNavBadgeTone;
  badgeLabel?: string;
  matchPrefixes?: string[];
};

type AdminNavTabsProps = {
  items: AdminNavLink[];
  pathname: string;
};

const BASE_TAB_CLASS =
  "inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

function tabClass(active: boolean, attention: boolean): string {
  if (active) {
    return attention
      ? "bg-[#7042c5] text-white ring-2 ring-[#f59e0b] ring-offset-1"
      : "bg-[#7042c5] text-white";
  }

  return attention
    ? "border border-[#f5b56b] bg-[#fff4e6] text-[#b45309]"
    : "border border-[#e4d7f4] bg-white text-[#7042c5]";
}

function badgeClass(active: boolean, attention: boolean): string {
  if (attention) {
    return "bg-[#f97316] text-white";
  }

  return active ? "bg-white text-[#7042c5]" : "bg-[#7042c5] text-white";
}

/** Pure presentational tab bar (pathname is passed in) so it can be rendered in unit tests. */
export default function AdminNavTabs({ items, pathname }: AdminNavTabsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Панель управления">
      {items.map((item) => {
        const active = isAdminNavPathActive(
          { href: item.href, activePrefixes: item.matchPrefixes },
          pathname,
        );
        const badgeText = formatAdminNavBadgeCount(item.badgeCount);
        const attention = badgeText !== null && item.badgeTone === "attention";

        return (
          <Link
            key={item.href}
            href={item.href}
            data-nav-href={item.href}
            data-nav-attention={attention ? "true" : undefined}
            aria-current={active ? "page" : undefined}
            className={`${BASE_TAB_CLASS} ${tabClass(active, attention)}`}
          >
            <span className="truncate">{item.label}</span>
            {badgeText !== null ? (
              <span
                data-nav-badge={item.badgeTone ?? "default"}
                className={`inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold leading-none tabular-nums ${badgeClass(active, attention)}`}
                aria-label={`${item.badgeLabel ?? "Новых"}: ${badgeText}`}
              >
                {badgeText}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
