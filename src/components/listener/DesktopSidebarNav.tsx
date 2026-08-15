"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import PersonalMaterialLockIcon from "@/components/personal-materials/PersonalMaterialLockIcon";
import {
  getListenerSidebarNavItems,
  isListenerPrimaryNavItemActive,
} from "@/lib/navigation/listener-nav";

type DesktopSidebarNavProps = {
  showMyMaterialsNav: boolean;
  showEditorialNav?: boolean;
  showEditorialDirectionsNav?: boolean;
};

function HelpNavIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9.6 9.4a2.4 2.4 0 0 1 4.7.8c0 1.4-1.3 2-2.1 2.5-.6.4-.9.8-.9 1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

export default function DesktopSidebarNav({
  showMyMaterialsNav,
  showEditorialNav = false,
  showEditorialDirectionsNav = false,
}: DesktopSidebarNavProps) {
  const pathname = usePathname();
  const items = getListenerSidebarNavItems({ showMyMaterialsNav });
  const editorialActive =
    pathname === "/editorial/playlists" ||
    pathname.startsWith("/editorial/playlists/");
  const directionsActive =
    pathname === "/editorial/directions" ||
    pathname.startsWith("/editorial/directions/");

  return (
    <>
      <nav aria-label="Моё пространство">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isListenerPrimaryNavItemActive(pathname, item.href, {
              isNeutralPath: pathname === "/",
            });

            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-[15px] leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                    active
                      ? "bg-[#f3ebfc] font-semibold text-[#7042c5]"
                      : "font-medium text-[#4a3d6b] hover:bg-[#faf6ff] hover:text-[#7042c5]"
                  }`}
                >
                  {item.icon === "lock" ? (
                    <PersonalMaterialLockIcon className="h-4 w-4 shrink-0" />
                  ) : null}
                  {item.icon === "help" ? (
                    <HelpNavIcon className="h-4 w-4 shrink-0" />
                  ) : null}
                  <span className="min-w-0 break-words">{item.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {showEditorialNav ? (
        <div className="mt-5">
          <p className="px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9485b4]">
            Редакция
          </p>
          <nav aria-label="Редакция" className="mt-1">
            <Link
              href="/editorial/playlists"
              aria-current={editorialActive ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-[15px] leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                editorialActive
                  ? "bg-[#f3ebfc] font-semibold text-[#7042c5]"
                  : "font-medium text-[#4a3d6b] hover:bg-[#faf6ff] hover:text-[#7042c5]"
              }`}
            >
              <span className="min-w-0 break-words">Открытые плейлисты</span>
            </Link>
            {showEditorialDirectionsNav ? (
              <Link
                href="/editorial/directions"
                aria-current={directionsActive ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-[15px] leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                  directionsActive
                    ? "bg-[#f3ebfc] font-semibold text-[#7042c5]"
                    : "font-medium text-[#4a3d6b] hover:bg-[#faf6ff] hover:text-[#7042c5]"
                }`}
              >
                <span className="min-w-0 break-words">Направления</span>
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}
    </>
  );
}
