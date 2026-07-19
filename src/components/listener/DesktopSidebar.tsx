import Image from "next/image";
import Link from "next/link";

import DesktopSidebarNav from "@/components/listener/DesktopSidebarNav";
import type { ListenerShellData } from "@/lib/listener/shell-data";

const SIDEBAR_LOGO_WIDTH = 1796;
const SIDEBAR_LOGO_HEIGHT = 402;
const SIDEBAR_BANNER_WIDTH = 1254;
const SIDEBAR_BANNER_HEIGHT = 1254;

const BECOME_AUTHOR_BANNER_SRC = "/images/sidebar/become-author-banner.png";
const AUTHOR_DASHBOARD_BANNER_SRC =
  "/images/sidebar/author-dashboard-banner.png";

function isListenerAuthorDashboardHref(href: string): boolean {
  return href.startsWith("/author-dashboard");
}

type DesktopSidebarProps = {
  shellData: ListenerShellData;
};

export default function DesktopSidebar({ shellData }: DesktopSidebarProps) {
  const isAuthor = isListenerAuthorDashboardHref(shellData.authorCta.href);
  const bannerSrc = isAuthor
    ? AUTHOR_DASHBOARD_BANNER_SRC
    : BECOME_AUTHOR_BANNER_SRC;
  const bannerAriaLabel = isAuthor
    ? "Перейти в кабинет автора"
    : "Стать автором на АудиоЛад";

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

      <Link
        href={shellData.authorCta.href}
        aria-label={bannerAriaLabel}
        className="mx-3 mb-3 block shrink-0 transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_6px_16px_rgba(90,60,145,0.14)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <Image
          src={bannerSrc}
          alt=""
          width={SIDEBAR_BANNER_WIDTH}
          height={SIDEBAR_BANNER_HEIGHT}
          className="h-auto w-full"
        />
      </Link>
    </aside>
  );
}
