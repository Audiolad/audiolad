"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import {
  CatalogNavIcon,
  HomeNavIcon,
  LibraryNavIcon,
  PlaylistsNavIcon,
  ProfileNavIcon,
} from "@/components/BottomNavIcons";
import {
  BOTTOM_NAV_MAIN_HEIGHT_PX,
  shouldShowBottomNav,
} from "@/lib/navigation/bottom-nav";

type NavItem = {
  title: string;
  href: string;
  Icon: ComponentType<{ active?: boolean; className?: string }>;
};

const items: NavItem[] = [
  { title: "Главная", href: "/", Icon: HomeNavIcon },
  { title: "Каталог", href: "/catalog", Icon: CatalogNavIcon },
  { title: "Аудиотека", href: "/my-practices", Icon: LibraryNavIcon },
  { title: "Плейлисты", href: "/playlists", Icon: PlaylistsNavIcon },
  { title: "Профиль", href: "/profile", Icon: ProfileNavIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  if (!shouldShowBottomNav(pathname)) {
    return null;
  }

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-[#eadff8] bg-white shadow-[0_-8px_30px_rgba(86,52,141,0.08)]"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        className="grid grid-cols-5 items-stretch px-1"
        style={{ height: `${BOTTOM_NAV_MAIN_HEIGHT_PX}px` }}
      >
        {items.map((item) => {
          const active = isActive(item.href);
          const { Icon } = item;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.title}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 text-[12px] leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5] ${
                active
                  ? "font-semibold text-[#7042c5]"
                  : "font-medium text-[#81759f] hover:text-[#6f5f92]"
              }`}
            >
              <Icon active={active} />
              <span className="max-w-full truncate">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
