"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  isListenerPrimaryNavItemActive,
  LISTENER_SIDEBAR_NAV_ITEMS,
} from "@/lib/navigation/listener-nav";

export default function DesktopSidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Моё пространство">
      <ul className="space-y-1">
        {LISTENER_SIDEBAR_NAV_ITEMS.map((item) => {
          const active = isListenerPrimaryNavItemActive(pathname, item.href, {
            isNeutralPath: pathname === "/",
          });

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-xl px-3 py-2.5 text-[15px] leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                  active
                    ? "bg-[#f3ebfc] font-semibold text-[#7042c5]"
                    : "font-medium text-[#4a3d6b] hover:bg-[#faf6ff] hover:text-[#7042c5]"
                }`}
              >
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
