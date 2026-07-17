import Link from "next/link";

import DesktopSidebarNav from "@/components/listener/DesktopSidebarNav";
import type { ListenerShellData } from "@/lib/listener/shell-data";

type DesktopSidebarProps = {
  shellData: ListenerShellData;
};

export default function DesktopSidebar({ shellData }: DesktopSidebarProps) {
  return (
    <aside
      className="flex h-full min-h-0 w-[var(--listener-sidebar-width)] shrink-0 flex-col rounded-[20px] border border-[#eadff8] bg-[#fffdfd] p-4 shadow-[0_8px_24px_rgba(90,60,145,0.06)]"
      aria-label="Моё пространство"
    >
      <h2 className="px-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
        Моё пространство
      </h2>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <DesktopSidebarNav />
      </div>

      <div className="mt-4 shrink-0 rounded-[18px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] to-[#f5ecff] p-4">
        <p className="text-[14px] font-medium leading-snug text-[#4a3d6b]">
          Создавайте и вдохновляйте тысячи людей
        </p>
        <Link
          href={shellData.authorCta.href}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6234b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {shellData.authorCta.label}
        </Link>
      </div>
    </aside>
  );
}
