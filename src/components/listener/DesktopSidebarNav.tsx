"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import {
  CatalogNavIcon,
  EditorialDirectionsNavIcon,
  EditorialPlaylistsNavIcon,
  HelpNavIcon,
  HistoryNavIcon,
  LibraryNavIcon,
  PlaylistsNavIcon,
  ProfileNavIcon,
} from "@/components/BottomNavIcons";
import PersonalMaterialLockIcon from "@/components/personal-materials/PersonalMaterialLockIcon";
import {
  getListenerSidebarNavItems,
  getListenerSidebarNavSection,
  isListenerPrimaryNavItemActive,
  type ListenerSidebarNavIconKey,
  type ListenerSidebarNavItem,
} from "@/lib/navigation/listener-nav";

type DesktopSidebarNavProps = {
  showMyMaterialsNav: boolean;
  showEditorialNav?: boolean;
  showEditorialDirectionsNav?: boolean;
  variant?: "labels" | "icons";
  decorative?: boolean;
};

type SidebarIconProps = {
  active?: boolean;
  className?: string;
};

const SIDEBAR_NAV_ICONS: Record<
  ListenerSidebarNavIconKey,
  ComponentType<SidebarIconProps>
> = {
  catalog: CatalogNavIcon,
  library: LibraryNavIcon,
  playlists: PlaylistsNavIcon,
  history: HistoryNavIcon,
  profile: ProfileNavIcon,
  help: HelpNavIcon,
  "editorial-playlists": EditorialPlaylistsNavIcon,
  "editorial-directions": EditorialDirectionsNavIcon,
  lock: ({ className }: SidebarIconProps) => (
    <PersonalMaterialLockIcon className={className} />
  ),
};

const NAV_LINK_FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

function navLinkTone(active: boolean) {
  return active
    ? "bg-[#f3ebfc] font-semibold text-[#7042c5]"
    : "font-medium text-[#4a3d6b] hover:bg-[#faf6ff] hover:text-[#7042c5]";
}

function SidebarItemIcon({
  item,
  active,
  className,
}: {
  item: ListenerSidebarNavItem;
  active: boolean;
  className: string;
}) {
  const iconKey = item.icon ?? (item.key as ListenerSidebarNavIconKey);
  const Icon = SIDEBAR_NAV_ICONS[iconKey];
  if (!Icon) {
    return null;
  }
  return <Icon active={active} className={className} />;
}

function SidebarNavLink({
  item,
  active,
  variant,
  decorative,
}: {
  item: ListenerSidebarNavItem;
  active: boolean;
  variant: "labels" | "icons";
  decorative: boolean;
}) {
  const iconOnly = variant === "icons";

  return (
    <Link
      href={item.href}
      title={item.title}
      aria-label={item.title}
      aria-current={active ? "page" : undefined}
      tabIndex={decorative ? -1 : undefined}
      className={`flex min-h-11 items-center rounded-xl transition-colors ${NAV_LINK_FOCUS} ${navLinkTone(active)} ${
        iconOnly
          ? "justify-center px-2 py-2"
          : "gap-2.5 px-3 py-2.5 text-[15px] leading-snug"
      }`}
    >
      <SidebarItemIcon
        item={item}
        active={active}
        className="!h-6 !w-6 shrink-0"
      />
      {iconOnly ? (
        <span className="sr-only">{item.title}</span>
      ) : (
        <span className="min-w-0 break-words">{item.title}</span>
      )}
    </Link>
  );
}

export default function DesktopSidebarNav({
  showMyMaterialsNav,
  showEditorialNav = false,
  showEditorialDirectionsNav = false,
  variant = "labels",
  decorative = false,
}: DesktopSidebarNavProps) {
  const pathname = usePathname();
  const items = getListenerSidebarNavItems({
    showMyMaterialsNav,
    showEditorialNav,
    showEditorialDirectionsNav,
  });
  const spaceItems = items.filter(
    (item) => getListenerSidebarNavSection(item) === "space",
  );
  const editorialItems = items.filter(
    (item) => getListenerSidebarNavSection(item) === "editorial",
  );
  const iconOnly = variant === "icons";

  return (
    <>
      <nav aria-label="Моё пространство" aria-hidden={decorative || undefined}>
        <ul className="space-y-1">
          {spaceItems.map((item) => {
            const active = isListenerPrimaryNavItemActive(pathname, item.href, {
              isNeutralPath: pathname === "/",
            });

            return (
              <li key={item.key}>
                <SidebarNavLink
                  item={item}
                  active={active}
                  variant={variant}
                  decorative={decorative}
                />
              </li>
            );
          })}
        </ul>
      </nav>
      {editorialItems.length > 0 ? (
        <div className={iconOnly ? "mt-2" : "mt-5"}>
          {iconOnly ? null : (
            <p className="px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9485b4]">
              Редакция
            </p>
          )}
          <nav
            aria-label="Редакция"
            aria-hidden={decorative || undefined}
            className={iconOnly ? undefined : "mt-1"}
          >
            <ul className="space-y-1">
              {editorialItems.map((item) => {
                const active = isListenerPrimaryNavItemActive(
                  pathname,
                  item.href,
                  { isNeutralPath: pathname === "/" },
                );

                return (
                  <li key={item.key}>
                    <SidebarNavLink
                      item={item}
                      active={active}
                      variant={variant}
                      decorative={decorative}
                    />
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      ) : null}
    </>
  );
}
