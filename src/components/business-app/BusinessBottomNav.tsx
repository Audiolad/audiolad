"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { useBusinessHostname, useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { businessCabinetHomePath, businessNavPathname } from "@/lib/business-app/host";

import {
  BizDocumentsIcon,
  BizHelpIcon,
  BizHomeIcon,
  BizLockIcon,
  BizMusicIcon,
  BizProfileIcon,
  BizSettingsIcon,
} from "@/components/business-app/BusinessIcons";
import { useBusinessCabinetMode } from "@/components/business-app/BusinessPointMode";
import { useBusinessGuestStatus } from "@/components/business-app/BusinessGuestStatus";
import {
  BUSINESS_LOCKED_LABEL,
  businessNavHref,
  isBusinessNavItemLocked,
  resolveBusinessAccess,
} from "@/lib/business-app/access";
import {
  businessActiveNavItemId,
  businessNavItemsForSections,
  type BusinessNavIconKey,
} from "@/lib/business-app/nav";

const ICONS: Record<
  Extract<BusinessNavIconKey, "home" | "music" | "settings" | "documents" | "help" | "profile">,
  ComponentType<{ active?: boolean; className?: string }>
> = {
  home: BizHomeIcon,
  music: BizMusicIcon,
  settings: BizSettingsIcon,
  documents: BizDocumentsIcon,
  help: BizHelpIcon,
  profile: BizProfileIcon,
};

/**
 * Mobile cabinet bar: icons only. Labels overlapped at 360–430px, so the Russian
 * name stays on aria-label and title. A locked section keeps a small lock on the icon.
 */
export default function BusinessBottomNav() {
  const hostname = useBusinessHostname();
  const pathname = businessNavPathname(usePathname() || "/", hostname);
  // One table for every menu (cabinet-mode.ts): owner, preview «как видит точка», hall device.
  const cabinet = useBusinessCabinetMode();
  const items = businessNavItemsForSections(cabinet.sections);
  const access = resolveBusinessAccess(useBusinessDomain(), cabinet.side === "venue");
  const { showLocked } = useBusinessGuestStatus();
  const activeId = businessActiveNavItemId(pathname, items);

  return (
    <nav className="business-app-bottom-nav" aria-label="Мобильная навигация">
      {items.map((item) => {
        const active = item.id === activeId;
        const locked = isBusinessNavItemLocked(item, access);
        const Icon = ICONS[item.icon as keyof typeof ICONS];
        const name = locked ? `${item.title} – ${BUSINESS_LOCKED_LABEL}` : item.title;
        const icon = (
          <span className="business-app-bottom-nav__icon">
            <Icon active={active} />
            {locked ? <BizLockIcon className="business-app-bottom-nav__lock" /> : null}
          </span>
        );
        if (locked) {
          return (
            <button
              key={item.id}
              type="button"
              data-locked="true"
              data-nav-id={item.id}
              aria-label={name}
              title={name}
              onClick={() => showLocked(item.title)}
              className={`business-app-focus-ring business-app-bottom-nav__item business-app-nav-locked${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {icon}
            </button>
          );
        }
        return (
          <Link
            key={item.id}
            href={item.href === "/" ? businessCabinetHomePath(hostname) : businessNavHref(item, access)}
            data-nav-id={item.id}
            aria-label={name}
            title={name}
            className={`business-app-focus-ring business-app-bottom-nav__item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {icon}
          </Link>
        );
      })}
    </nav>
  );
}
