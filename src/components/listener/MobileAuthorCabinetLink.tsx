"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import AuthorUnreadCommentBadge from "@/components/author-dashboard/AuthorUnreadCommentBadge";
import { isMobileTopChromeRoute } from "@/lib/listener/mobile-top-chrome";

type MobileAuthorCabinetLinkProps = {
  href: string;
  label: string;
};

/**
 * Mobile «Кабинет автора» entry above listener page content.
 * Not rendered on routes with the fixed MobileTopChrome: there it would sit
 * under the fixed search layer and only leave an empty gap.
 */
export default function MobileAuthorCabinetLink({
  href,
  label,
}: MobileAuthorCabinetLinkProps) {
  const pathname = usePathname();

  if (isMobileTopChromeRoute(pathname)) {
    return null;
  }

  return (
    <div className="px-4 pt-3 xl:hidden" data-author-cabinet-mobile="true">
      <div className="relative">
        <Link
          href={href}
          className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-[14px] border border-[#e8ddf5] bg-[#faf7fd] px-3 text-sm font-semibold text-[#7042c5]"
        >
          {label}
        </Link>
        <AuthorUnreadCommentBadge placement="sidebar" />
      </div>
    </div>
  );
}
