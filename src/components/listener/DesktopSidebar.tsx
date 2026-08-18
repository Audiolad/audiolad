import Image from "next/image";
import Link from "next/link";

import DesktopSidebarNav from "@/components/listener/DesktopSidebarNav";
import type { ListenerShellData } from "@/lib/listener/shell-data";

import sidebarLogo from "../../../public/brand/audiolad-logo-sidebar-v2.webp";
import becomeAuthorBanner from "../../../public/images/sidebar/become-author-banner-v2.webp";

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
            src={sidebarLogo}
            alt="АудиоЛад"
            className="h-10 w-auto max-w-full object-contain object-left"
            sizes="280px"
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
        <DesktopSidebarNav
          showMyMaterialsNav={shellData.showMyMaterialsNav}
          showEditorialNav={shellData.showEditorialNav}
          showEditorialDirectionsNav={shellData.showEditorialDirectionsNav}
        />
      </div>

      {shellData.showSidebarAuthorPromo ? (
        <Link
          href={shellData.authorCta.href}
          aria-label="Стать автором на АудиоЛад"
          className="mx-3 mb-3 block shrink-0 transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_6px_16px_rgba(90,60,145,0.14)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <Image
            src={becomeAuthorBanner}
            alt=""
            sizes="216px"
            className="h-auto w-full"
          />
        </Link>
      ) : null}
    </aside>
  );
}
