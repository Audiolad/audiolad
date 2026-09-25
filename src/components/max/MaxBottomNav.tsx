"use client";

import type { ComponentType } from "react";

import {
  CatalogNavIcon,
  HomeNavIcon,
  LibraryNavIcon,
  PlaylistsNavIcon,
  ProfileNavIcon,
} from "@/components/BottomNavIcons";
import {
  MAX_PRIMARY_TABS,
  MAX_TAB_BAR_HEIGHT_PX,
  type MaxPrimaryTab,
} from "@/lib/max/primary-tabs";

const MAX_TAB_ICONS: Record<
  MaxPrimaryTab,
  ComponentType<{ active?: boolean; className?: string }>
> = {
  home: HomeNavIcon,
  catalog: CatalogNavIcon,
  library: LibraryNavIcon,
  playlists: PlaylistsNavIcon,
  profile: ProfileNavIcon,
};

type MaxBottomNavProps = {
  activeTab: MaxPrimaryTab;
  onSelectTab: (tab: MaxPrimaryTab) => void;
};

export default function MaxBottomNav({
  activeTab,
  onSelectTab,
}: MaxBottomNavProps) {
  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-20 w-full border-t border-[#eadff8] bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_30px_rgba(86,52,141,0.08)]"
    >
      <div
        className="mx-auto grid w-full grid-cols-5 items-stretch px-1"
        style={{ height: `${MAX_TAB_BAR_HEIGHT_PX}px` }}
      >
        {MAX_PRIMARY_TABS.map((tab) => {
          const active = tab.id === activeTab;
          const Icon = MAX_TAB_ICONS[tab.id];

          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectTab(tab.id)}
              className={`flex min-h-11 w-full min-w-11 flex-col items-center justify-center gap-1 px-1 py-1 text-[12px] leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5] ${
                active
                  ? "font-semibold text-[#7042c5]"
                  : "font-medium text-[#81759f] hover:text-[#6f5f92]"
              }`}
            >
              <Icon active={active} />
              <span className="max-w-full truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
