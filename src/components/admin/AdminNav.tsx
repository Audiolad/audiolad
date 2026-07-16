"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Обзор", match: (path: string) => path === "/admin" },
  {
    href: "/admin/author-applications",
    label: "Заявки авторов",
    match: (path: string) => path.startsWith("/admin/author-applications"),
  },
  {
    href: "/admin/users",
    label: "Пользователи",
    match: (path: string) => path.startsWith("/admin/users"),
  },
] as const;

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Панель управления">
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-[#7042c5] text-white"
                : "border border-[#e4d7f4] bg-white text-[#7042c5]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
