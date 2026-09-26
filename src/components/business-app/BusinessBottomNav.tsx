"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import {
  BizHomeIcon,
  BizLocationsIcon,
  BizMoreIcon,
  BizMusicIcon,
  BizStatsIcon,
} from "@/components/business-app/BusinessIcons";
import { normalizeBusinessAppPathname } from "@/lib/business-app/host";
import {
  BUSINESS_MOBILE_NAV_ITEMS,
  isBusinessNavItemActive,
  type BusinessNavIconKey,
} from "@/lib/business-app/nav";

const ICONS: Record<
  Extract<BusinessNavIconKey, "home" | "locations" | "music" | "stats" | "more">,
  ComponentType<{ active?: boolean; className?: string }>
> = {
  home: BizHomeIcon,
  locations: BizLocationsIcon,
  music: BizMusicIcon,
  stats: BizStatsIcon,
  more: BizMoreIcon,
};

export default function BusinessBottomNav() {
  const pathname = normalizeBusinessAppPathname(usePathname() || "/");

  return (
    <nav className="business-app-bottom-nav" aria-label="Мобильная навигация">
      {BUSINESS_MOBILE_NAV_ITEMS.map((item) => {
        const active = isBusinessNavItemActive(pathname, item.href);
        const Icon = ICONS[item.icon as keyof typeof ICONS];
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`business-app-focus-ring flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[0.68rem] font-medium ${
              active
                ? "text-[var(--biz-accent)]"
                : "text-[var(--biz-text-muted)]"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon active={active} className="h-[24px] w-[24px]" />
            <span>{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
