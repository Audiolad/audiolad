"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";

import {
  BizAnnouncementsIcon,
  BizCollapseIcon,
  BizDocumentsIcon,
  BizExpandIcon,
  BizHelpIcon,
  BizHomeIcon,
  BizLocationsIcon,
  BizLockIcon,
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
  isBusinessNavItemCurrent,
  type BusinessNavIconKey,
  type BusinessNavItem,
} from "@/lib/business-app/nav";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { useBusinessGuestStatus } from "@/components/business-app/BusinessGuestStatus";
import {
  BUSINESS_CONNECT_HREF,
  BUSINESS_LOCKED_LABEL,
  businessNavHref,
  isBusinessNavItemLocked,
  resolveBusinessAccess,
  type BusinessAccess,
} from "@/lib/business-app/access";
import { normalizeBusinessAppPathname } from "@/lib/business-app/host";

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
  access,
}: {
  item: BusinessNavItem;
  collapsed: boolean;
  access: BusinessAccess;
}) {
  const pathname = normalizeBusinessAppPathname(usePathname() || "/");
  const active = isBusinessNavItemCurrent(pathname, item);
  const Icon = ICONS[item.icon];
  const labelId = useId();
  const { showLocked } = useBusinessGuestStatus();
  const locked = isBusinessNavItemLocked(item, access);

  const tooltip = collapsed ? (
    <span
      id={labelId}
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%+0.55rem)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--biz-tooltip-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--biz-tooltip-text)] shadow-lg group-hover:block group-focus-visible:block"
    >
      {locked ? `${item.title} – ${BUSINESS_LOCKED_LABEL}` : item.title}
    </span>
  ) : null;

  if (locked) {
    // a8240527: protected section, visible in the same navigation, opens after connecting.
    return (
      <button
        type="button"
        data-locked="true"
        data-nav-id={item.id}
        onClick={() => showLocked(item.title)}
        className={`business-app-focus-ring business-app-nav-locked group relative flex w-full items-center gap-3 rounded-xl px-3 text-left text-[0.95rem] text-[var(--biz-text-muted)] hover:bg-[var(--biz-surface-soft)] ${
          collapsed ? "justify-center py-3" : "py-2.5"
        }`}
        aria-label={`${item.title} – ${BUSINESS_LOCKED_LABEL}`}
        title={collapsed ? undefined : BUSINESS_LOCKED_LABEL}
      >
        <Icon />
        {!collapsed ? (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5">
              {item.title}
              <BizLockIcon className="opacity-70" />
            </span>
            <span className="text-[0.72rem] leading-tight">{BUSINESS_LOCKED_LABEL}</span>
          </span>
        ) : null}
        {tooltip}
      </button>
    );
  }

  return (
    <Link
      href={businessNavHref(item, access)}
      data-nav-id={item.id}
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
      {tooltip}
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
  // SSR always renders the expanded sidebar; the device preference (localStorage / ≤1200px) is
  // applied after hydration, otherwise narrow screens hit a React hydration mismatch (a8240527).
  const [collapsed, setCollapsed] = useState(false);
  const restored = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the device preference after hydration
    setCollapsed(readInitialCollapsed());
  }, []);

  useEffect(() => {
    const width = collapsed
      ? BUSINESS_SIDEBAR_COLLAPSED_WIDTH_PX
      : BUSINESS_SIDEBAR_EXPANDED_WIDTH_PX;
    document.documentElement.style.setProperty(
      "--biz-sidebar-width",
      `${width}px`,
    );
    if (!restored.current) {
      restored.current = true;
      return;
    }
    try {
      window.localStorage.setItem(
        BUSINESS_SIDEBAR_STORAGE_KEY,
        collapsed ? "collapsed" : "expanded",
      );
    } catch {
      // ignore
    }
  }, [collapsed]);

  const domain = useBusinessDomain();
  const access = resolveBusinessAccess(domain);
  const ownerFirstName =
    domain.status === "authenticated" ? domain.owner.firstName : "Гость";
  const locationName =
    domain.status === "authenticated" && domain.location
      ? domain.location.name
      : domain.status === "authenticated"
        ? "Точка ещё не создана"
        : "Гостевой режим";
  const ownerInitial = ownerFirstName.slice(0, 1).toUpperCase() || "А";
  const cabinet = !normalizeBusinessAppPathname(usePathname() || "/").startsWith("/guest");

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
        className={`flex ${cabinet ? "items-center" : "items-start"} gap-2 border-b border-[var(--biz-border)] px-3 py-4 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        {cabinet ? (
          // eslint-disable-next-line @next/next/no-img-element -- same 2 KB vector as the favicon
          <img
            src="/business/brand/favicon.svg"
            alt={collapsed ? "АудиоЛад Бизнес" : ""}
            width={40}
            height={40}
            className="business-app-brand-mark"
          />
        ) : null}
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className={`${cabinet ? "business-app-brand-name " : ""}text-[1.05rem] font-bold leading-tight text-[var(--biz-text)]`}>
              Аудиолад
            </p>
            <p className="text-sm font-medium text-[var(--biz-accent)]">Бизнес</p>
          </div>
        ) : cabinet ? null : (
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
          <NavLink key={item.id} item={item} collapsed={collapsed} access={access} />
        ))}
        <div
          className="my-2 border-t border-[var(--biz-border)]"
          role="separator"
          aria-hidden
        />
        {BUSINESS_SECONDARY_NAV_ITEMS.map((item) => (
          <NavLink key={item.id} item={item} collapsed={collapsed} access={access} />
        ))}
      </nav>

      <div
        className={`mt-auto border-t border-[var(--biz-border)] px-3 py-4 ${
          collapsed ? "flex justify-center" : ""
        }`}
      >
        {collapsed ? (
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--biz-accent)] text-sm font-semibold text-[var(--biz-on-accent)]"
            title={`${ownerFirstName} · ${locationName}`}
            aria-label={`${ownerFirstName}, ${locationName}`}
          >
            {ownerInitial}
          </span>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--biz-accent)] text-sm font-semibold text-[var(--biz-on-accent)]">
              {ownerInitial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--biz-text)]">
                {ownerFirstName}
              </p>
              <p className="truncate text-xs text-[var(--biz-text-muted)]">
                {locationName}
              </p>
            </div>
          </div>
        )}
        {access.level === "guest" && !collapsed ? (
          <Link
            href={BUSINESS_CONNECT_HREF}
            className="mt-3 business-app-btn business-app-btn-primary business-app-focus-ring w-full"
            data-testid="biz-sidebar-connect"
          >
            Подключить
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
