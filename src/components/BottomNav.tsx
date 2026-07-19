"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ComponentType } from "react";
import { createPortal } from "react-dom";

import {
  CatalogNavIcon,
  HomeNavIcon,
  LibraryNavIcon,
  PlaylistsNavIcon,
  ProfileNavIcon,
} from "@/components/BottomNavIcons";
import {
  BOTTOM_NAV_MAIN_HEIGHT_PX,
  isBottomNavNeutralPathname,
  shouldShowBottomNav,
  type BottomNavVariant,
} from "@/lib/navigation/bottom-nav";
import {
  isListenerPrimaryNavItemActive,
  LISTENER_PRIMARY_NAV_ITEMS,
  type ListenerPrimaryNavIconKey,
} from "@/lib/navigation/listener-nav";

type NavItem = {
  title: string;
  href: string;
  Icon: ComponentType<{ active?: boolean; className?: string }>;
};

const LISTENER_NAV_ICONS: Record<
  ListenerPrimaryNavIconKey,
  NavItem["Icon"]
> = {
  home: HomeNavIcon,
  catalog: CatalogNavIcon,
  library: LibraryNavIcon,
  playlists: PlaylistsNavIcon,
  profile: ProfileNavIcon,
};

const items: NavItem[] = LISTENER_PRIMARY_NAV_ITEMS.map((item) => ({
  title: item.title,
  href: item.href,
  Icon: LISTENER_NAV_ICONS[item.icon],
}));

type BottomNavProps = {
  variant?: BottomNavVariant;
  className?: string;
};

function useClientMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function BottomNav({
  variant = "default",
  className = "",
}: BottomNavProps) {
  const pathname = usePathname();
  const mounted = useClientMounted();
  const isPlayerVariant = variant === "player";
  const isNeutralPath = isBottomNavNeutralPathname(pathname);

  if (!shouldShowBottomNav(pathname) || !mounted) {
    return null;
  }

  function isActive(href: string) {
    return isListenerPrimaryNavItemActive(pathname, href, {
      isNeutralPath: isNeutralPath,
    });
  }

  const nav = (
    <nav
      aria-label="Основная навигация"
      className={
        isPlayerVariant
          ? `bottom-nav bottom-nav--player ${className}`.trim()
          : `bottom-nav bottom-nav--default border-t border-[#eadff8] bg-white shadow-[0_-8px_30px_rgba(86,52,141,0.08)] ${className}`.trim()
      }
    >
      <div
        className={
          isPlayerVariant
            ? "bottom-nav__inner mx-auto grid w-full max-w-[430px] grid-cols-5 items-stretch px-4"
            : "bottom-nav__inner mx-auto grid w-full max-w-[430px] grid-cols-5 items-stretch px-1"
        }
        style={{ height: `${BOTTOM_NAV_MAIN_HEIGHT_PX}px` }}
      >
        {items.map((item) => {
          const active = isActive(item.href);
          const { Icon } = item;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-label={item.title}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 text-[12px] leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${
                isPlayerVariant
                  ? active
                    ? "font-semibold text-white focus-visible:outline-white"
                    : "font-medium text-white/65 hover:text-white/85 focus-visible:outline-white/80"
                  : active
                    ? "font-semibold text-[#7042c5] focus-visible:outline-[#7042c5]"
                    : "font-medium text-[#81759f] hover:text-[#6f5f92] focus-visible:outline-[#7042c5]"
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

  return createPortal(nav, document.body);
}
