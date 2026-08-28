import type { ReactNode } from "react";

import BottomNav from "@/components/BottomNav";
import CatalogMobileFiltersSlot from "@/components/catalog/CatalogMobileFiltersSlot";
import DesktopShellSearch from "@/components/listener/DesktopShellSearch";
import DesktopPlayerBar from "@/components/listener/DesktopPlayerBar";
import DesktopRightColumn from "@/components/listener/DesktopRightColumn";
import DesktopSidebar from "@/components/listener/DesktopSidebar";
import { ListenerAppShellRoot } from "@/components/listener/ListenerAppShellRoot";
import type { ListenerShellData } from "@/lib/listener/shell-data";
import {
  resolveListenerShellConfig,
  type ListenerShellMode,
} from "@/lib/listener/shell-config";
import {
  LISTENER_SIDEBAR_DEFAULT_PINNED,
  type ListenerSidebarPinnedState,
} from "@/lib/navigation/listener-sidebar";

type ListenerAppShellProps = {
  children: ReactNode;
  shellData: ListenerShellData;
  mode?: ListenerShellMode;
  initialSidebarPinned?: ListenerSidebarPinnedState;
};

export function ListenerAppShell({
  children,
  shellData,
  mode = "default",
  initialSidebarPinned = LISTENER_SIDEBAR_DEFAULT_PINNED,
}: ListenerAppShellProps) {
  const config = resolveListenerShellConfig(mode);
  const bodyClassName = [
    "listener-app-shell__body mx-auto w-full max-w-[430px] bg-platform-surface lg:max-w-[1200px] xl:mx-0 xl:min-h-0 xl:max-w-none xl:flex-1 xl:bg-transparent",
    config.bodyClassName,
    config.showRightColumn ? "" : "listener-app-shell__body--no-right-column",
  ]
    .filter(Boolean)
    .join(" ");

  const centerContentClassName = [
    config.centerColumnClassName,
    "min-w-0",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ListenerAppShellRoot
      className="listener-app-shell bg-platform-surface text-[#25135c] xl:flex xl:min-h-dvh xl:h-dvh xl:flex-col xl:overflow-hidden xl:px-5 xl:pt-5 xl:pb-5"
      initialSidebarPinned={initialSidebarPinned}
    >
      <div className={bodyClassName}>
        {config.showDesktopSidebar ? (
          <div className="listener-app-shell__sidebar-slot hidden xl:flex xl:min-h-0 xl:self-stretch">
            <DesktopSidebar shellData={shellData} />
          </div>
        ) : null}

        <section className="listener-app-shell__main-column min-w-0 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
          {config.showDesktopSearch ? (
            <div className="hidden shrink-0 xl:block xl:px-6">
              <DesktopShellSearch
                catalogFilters={<CatalogMobileFiltersSlot />}
              />
            </div>
          ) : null}
          <div
            className={[
              "listener-app-shell__center-scroll xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-y-auto",
              config.showDesktopPlayerBar
                ? "xl:pb-[calc(1rem+var(--listener-desktop-player-height,0px))]"
                : "xl:pb-4",
            ].join(" ")}
          >
            <div className={centerContentClassName}>{children}</div>
          </div>
          {config.showDesktopPlayerBar ? <DesktopPlayerBar /> : null}
        </section>

        {config.showRightColumn ? (
          <div className="listener-app-shell__now-playing-slot hidden xl:flex xl:min-h-0 xl:self-stretch">
            <DesktopRightColumn
              shellData={shellData}
              showPlaybackControls={config.showRightColumnPlaybackControls}
            />
          </div>
        ) : null}
      </div>

      {config.showMobileBottomNav ? (
        <BottomNav className="xl:hidden" />
      ) : null}
    </ListenerAppShellRoot>
  );
}
