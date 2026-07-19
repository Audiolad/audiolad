import type { ReactNode } from "react";

import BottomNav from "@/components/BottomNav";
import DesktopCenterSearch from "@/components/listener/DesktopCenterSearch";
import DesktopPlayerBar from "@/components/listener/DesktopPlayerBar";
import DesktopRightColumn from "@/components/listener/DesktopRightColumn";
import DesktopSidebar from "@/components/listener/DesktopSidebar";
import type { ListenerShellData } from "@/lib/listener/shell-data";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

type ListenerAppShellProps = {
  children: ReactNode;
  shellData: ListenerShellData;
};

export function ListenerAppShell({
  children,
  shellData,
}: ListenerAppShellProps) {
  return (
    <div className="listener-app-shell bg-platform-surface text-[#25135c] xl:flex xl:min-h-dvh xl:h-dvh xl:flex-col xl:overflow-hidden xl:px-5 xl:pt-5 xl:pb-5">
      <div
        className={`listener-app-shell__body mx-auto w-full max-w-[430px] bg-platform-surface lg:max-w-[1200px] ${platformMobileShellClass} xl:mx-0 xl:min-h-0 xl:max-w-none xl:flex-1 xl:bg-transparent`}
      >
        <div className="listener-app-shell__sidebar-slot hidden xl:flex xl:min-h-0 xl:self-stretch">
          <DesktopSidebar shellData={shellData} />
        </div>

        <section className="listener-app-shell__main-column min-w-0 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
          <div className="listener-app-shell__center-scroll xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-y-auto xl:pb-[calc(1rem+var(--listener-desktop-player-height,0px))]">
            <div className="hidden xl:block xl:shrink-0 xl:px-6">
              <DesktopCenterSearch />
            </div>
            {children}
          </div>
          <DesktopPlayerBar />
        </section>

        <div className="listener-app-shell__now-playing-slot hidden xl:flex xl:min-h-0 xl:self-stretch">
          <DesktopRightColumn shellData={shellData} />
        </div>
      </div>

      <BottomNav className="xl:hidden" />
    </div>
  );
}
