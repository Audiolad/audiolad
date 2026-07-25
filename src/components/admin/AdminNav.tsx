"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminNavLink = {
  href: string;
  label: string;
  matchPrefixes?: string[];
};

type AdminNavProps = {
  items: AdminNavLink[];
};

export default function AdminNav({ items }: AdminNavProps) {
  const pathname = usePathname();

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Панель управления">
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
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
