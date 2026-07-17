import Image from "next/image";
import Link from "next/link";

import DesktopSidebarNav from "@/components/listener/DesktopSidebarNav";
import type { ListenerShellData } from "@/lib/listener/shell-data";

const SIDEBAR_LOGO_WIDTH = 1796;
const SIDEBAR_LOGO_HEIGHT = 402;

type DesktopSidebarProps = {
  shellData: ListenerShellData;
};

export default function DesktopSidebar({ shellData }: DesktopSidebarProps) {
  return (
    <aside
      className="flex h-full min-h-0 w-[var(--listener-sidebar-width)] shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fffdfd] shadow-[0_8px_24px_rgba(90,60,145,0.06)]"
      aria-label="Моё пространство"
    >
      <div className="flex min-h-14 shrink-0 items-center px-3 py-2">
        <Link
          href="/"
          className="inline-flex max-w-full rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <Image
            src="/brand/audiolad-logo-sidebar.png"
            alt="АудиоЛад"
            width={SIDEBAR_LOGO_WIDTH}
            height={SIDEBAR_LOGO_HEIGHT}
            className="h-10 w-auto max-w-full object-contain object-left"
            priority
          />
        </Link>
      </div>

      <Link
        href="/"
        className="block shrink-0 px-3 pt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9485b4] transition-colors hover:text-[#7f70a8] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Моё пространство
      </Link>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        <DesktopSidebarNav />
      </div>

      <div className="mx-3 mb-3 shrink-0 rounded-[18px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] to-[#f5ecff] p-4">
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
