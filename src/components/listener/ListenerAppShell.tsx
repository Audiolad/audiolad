import type { ReactNode } from "react";

import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/listener/DesktopSidebar";
import DesktopTopBar from "@/components/listener/DesktopTopBar";
import NowPlayingPanel from "@/components/listener/NowPlayingPanel";
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
    <div className="listener-app-shell min-h-dvh bg-platform-surface text-[#25135c] xl:flex xl:h-dvh xl:flex-col xl:gap-4 xl:overflow-hidden xl:px-5 xl:pt-5 xl:pb-[calc(1.25rem+var(--global-mini-player-height))]">
      <div className="hidden xl:block xl:shrink-0">
        <DesktopTopBar shellData={shellData} />
      </div>

      <div
        className={`listener-app-shell__body mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface lg:max-w-[1200px] ${platformMobileShellClass} xl:mx-0 xl:min-h-0 xl:max-w-none xl:flex-1 xl:bg-transparent`}
      >
        <div className="listener-app-shell__sidebar-slot hidden xl:flex xl:min-h-0 xl:self-stretch">
          <DesktopSidebar shellData={shellData} />
        </div>

        <section className="listener-app-shell__main-column min-w-0 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
          {children}
        </section>

        <div className="listener-app-shell__now-playing-slot hidden xl:flex xl:min-h-0 xl:self-stretch">
          <NowPlayingPanel />
        </div>
      </div>

      <div className="xl:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
