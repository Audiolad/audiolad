"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { shouldShowBottomNav } from "@/lib/navigation/bottom-nav";

const items = [
  {
    title: "Главная",
    href: "/",
    icon: "⌂",
  },
  {
    title: "Каталог",
    href: "/catalog",
    icon: "▦",
  },
  {
    title: "Аудиотека",
    href: "/my-practices",
    icon: "▥",
  },
  {
    title: "Плейлисты",
    href: "/playlists",
    icon: "♫",
  },
  {
    title: "Профиль",
    href: "/profile",
    icon: "◎",
  },
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
      className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 justify-around border-t border-[#eadff8] bg-white/95 px-1 pt-3 shadow-[0_-8px_30px_rgba(86,52,141,0.08)] backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
    >
      {items.map((item) => {
        const active = isActive(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-w-[72px] flex-col items-center gap-1 text-[11px] ${
              active ? "text-[#7042c5]" : "text-[#81759f]"
            }`}
          >
            <span className="text-[25px] leading-none">{item.icon}</span>
            <span>{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
