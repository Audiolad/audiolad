"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import {
  BizHomeIcon,
  BizLocationsIcon,
  BizLockIcon,
  BizMoreIcon,
  BizMusicIcon,
  BizStatsIcon,
} from "@/components/business-app/BusinessIcons";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { useBusinessGuestStatus } from "@/components/business-app/BusinessGuestStatus";
import {
  BUSINESS_LOCKED_LABEL,
  businessNavHref,
  isBusinessNavItemLocked,
  resolveBusinessAccess,
} from "@/lib/business-app/access";
import { normalizeBusinessAppPathname } from "@/lib/business-app/host";
import {
  BUSINESS_MOBILE_NAV_ITEMS,
  isBusinessNavItemCurrent,
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
  const access = resolveBusinessAccess(useBusinessDomain());
  const { showLocked } = useBusinessGuestStatus();

  return (
    <nav className="business-app-bottom-nav" aria-label="Мобильная навигация">
      {BUSINESS_MOBILE_NAV_ITEMS.map((item) => {
        const active = isBusinessNavItemCurrent(pathname, item);
        const Icon = ICONS[item.icon as keyof typeof ICONS];
        if (isBusinessNavItemLocked(item, access)) {
          // a8240527: same navigation for the guest; the section opens after connecting.
          return (
            <button
              key={item.id}
              type="button"
              data-locked="true"
              data-nav-id={item.id}
              aria-label={`${item.title} – ${BUSINESS_LOCKED_LABEL}`}
              onClick={() => showLocked(item.title)}
              className="business-app-focus-ring business-app-nav-locked relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[0.68rem] font-medium text-[var(--biz-text-muted)]"
            >
              <Icon className="h-[24px] w-[24px]" />
              <span className="flex items-center gap-0.5">
                {item.title}
                <BizLockIcon className="opacity-70" />
              </span>
            </button>
          );
        }
        return (
          <Link
            key={item.id}
            href={businessNavHref(item, access)}
            data-nav-id={item.id}
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
