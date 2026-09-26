"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ComponentType } from "react";

import {
  BizAnnouncementsIcon,
  BizCollapseIcon,
  BizDocumentsIcon,
  BizExpandIcon,
  BizHelpIcon,
  BizHomeIcon,
  BizLocationsIcon,
  BizMusicIcon,
  BizSettingsIcon,
  BizStatsIcon,
  BizTeamIcon,
} from "@/components/business-app/BusinessIcons";
import {
  BUSINESS_PRIMARY_NAV_ITEMS,
  BUSINESS_SECONDARY_NAV_ITEMS,
  BUSINESS_SIDEBAR_COLLAPSED_WIDTH_PX,
  BUSINESS_SIDEBAR_EXPANDED_WIDTH_PX,
  BUSINESS_SIDEBAR_STORAGE_KEY,
  isBusinessNavItemActive,
  type BusinessNavIconKey,
  type BusinessNavItem,
} from "@/lib/business-app/nav";
import { normalizeBusinessAppPathname } from "@/lib/business-app/host";
import { BUSINESS_HOME_MOCK } from "@/lib/business-app/mock-data";

type IconComp = ComponentType<{ active?: boolean; className?: string }>;

const ICONS: Record<BusinessNavIconKey, IconComp> = {
  home: BizHomeIcon,
  locations: BizLocationsIcon,
  music: BizMusicIcon,
  stats: BizStatsIcon,
  announcements: BizAnnouncementsIcon,
  documents: BizDocumentsIcon,
  team: BizTeamIcon,
  settings: BizSettingsIcon,
  help: BizHelpIcon,
  more: BizHomeIcon,
};

function NavLink({
  item,
  collapsed,
}: {
  item: BusinessNavItem;
  collapsed: boolean;
}) {
  const pathname = normalizeBusinessAppPathname(usePathname() || "/");
  const active = isBusinessNavItemActive(pathname, item.href);
  const Icon = ICONS[item.icon];
  const labelId = useId();

  return (
    <Link
      href={item.href}
      className={`business-app-focus-ring group relative flex items-center gap-3 rounded-xl px-3 text-[0.95rem] transition-colors ${
        collapsed ? "justify-center py-3" : "py-2.5"
      } ${
        active
          ? "bg-[var(--biz-accent-soft)] text-[var(--biz-accent)] font-semibold"
          : "text-[var(--biz-text-muted)] hover:bg-[var(--biz-surface-soft)] hover:text-[var(--biz-text)]"
      }`}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.title : undefined}
      title={collapsed ? item.title : undefined}
    >
      <Icon active={active} />
      {!collapsed ? <span>{item.title}</span> : null}
      {collapsed ? (
        <span
          id={labelId}
          role="tooltip"
          className="pointer-events-none absolute left-[calc(100%+0.55rem)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--biz-text)] px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block"
        >
          {item.title}
        </span>
      ) : null}
    </Link>
  );
}

function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(BUSINESS_SIDEBAR_STORAGE_KEY);
    if (stored === "collapsed") return true;
    if (stored === "expanded") return false;
    return window.matchMedia("(max-width: 1200px)").matches;
  } catch {
    return false;
  }
}

export default function BusinessSidebar() {
  const [collapsed, setCollapsed] = useState(readInitialCollapsed);

  useEffect(() => {
    const width = collapsed
      ? BUSINESS_SIDEBAR_COLLAPSED_WIDTH_PX
      : BUSINESS_SIDEBAR_EXPANDED_WIDTH_PX;
    document.documentElement.style.setProperty(
      "--biz-sidebar-width",
      `${width}px`,
    );
    try {
      window.localStorage.setItem(
        BUSINESS_SIDEBAR_STORAGE_KEY,
        collapsed ? "collapsed" : "expanded",
      );
    } catch {
      // ignore
    }
  }, [collapsed]);

  const owner = BUSINESS_HOME_MOCK.owner;
  const location = BUSINESS_HOME_MOCK.location;

  return (
    <aside
      className={`business-app-sidebar ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Навигация кабинета"
      style={{
        ["--biz-sidebar-width" as string]: collapsed
          ? `${BUSINESS_SIDEBAR_COLLAPSED_WIDTH_PX}px`
          : `${BUSINESS_SIDEBAR_EXPANDED_WIDTH_PX}px`,
      }}
    >
      <div
        className={`flex items-start gap-2 border-b border-[var(--biz-border)] px-3 py-4 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="text-[1.05rem] font-bold leading-tight text-[var(--biz-text)]">
              Аудиолад
            </p>
            <p className="text-sm font-medium text-[var(--biz-accent)]">Бизнес</p>
          </div>
        ) : (
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--biz-accent-soft)] text-sm font-bold text-[var(--biz-accent)]"
            aria-hidden
          >
            АБ
          </span>
        )}
        <button
          type="button"
          className="business-app-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--biz-text-muted)] hover:bg-[var(--biz-surface-soft)]"
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <BizExpandIcon /> : <BizCollapseIcon />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3" aria-label="Основное">
        {BUSINESS_PRIMARY_NAV_ITEMS.map((item) => (
          <NavLink key={item.id} item={item} collapsed={collapsed} />
        ))}
        <div
          className="my-2 border-t border-[var(--biz-border)]"
          role="separator"
          aria-hidden
        />
        {BUSINESS_SECONDARY_NAV_ITEMS.map((item) => (
          <NavLink key={item.id} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div
        className={`mt-auto border-t border-[var(--biz-border)] px-3 py-4 ${
          collapsed ? "flex justify-center" : ""
        }`}
      >
        {collapsed ? (
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--biz-accent)] text-sm font-semibold text-white"
            title={`${owner.firstName} · ${location.name}`}
            aria-label={`${owner.firstName}, ${location.name}`}
          >
            {owner.firstName.slice(0, 1)}
          </span>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--biz-accent)] text-sm font-semibold text-white">
              {owner.firstName.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--biz-text)]">
                {owner.firstName}
              </p>
              <p className="truncate text-xs text-[var(--biz-text-muted)]">
                {location.name}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
