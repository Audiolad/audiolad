import DesktopRightColumnTop from "@/components/listener/DesktopRightColumnTop";
import NowPlayingPanel from "@/components/listener/NowPlayingPanel";
import type { ListenerShellData } from "@/lib/listener/shell-data";

type DesktopRightColumnProps = {
  shellData: ListenerShellData;
};

export default function DesktopRightColumn({
  shellData,
}: DesktopRightColumnProps) {
  return (
    <aside
      className="listener-right-column flex h-full min-h-0 w-[var(--listener-now-playing-width)] shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fffdfd] shadow-[0_8px_24px_rgba(90,60,145,0.06)]"
      aria-label="Панель пользователя и воспроизведения"
    >
      <div className="shrink-0 px-4 pt-4">
        <DesktopRightColumnTop shellData={shellData} />
      </div>
      <NowPlayingPanel embedded />
    </aside>
  );
}
