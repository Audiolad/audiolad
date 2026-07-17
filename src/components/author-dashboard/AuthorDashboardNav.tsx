"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c1.5-3 4.5-5 7-5s5.5 2 7 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PromotionIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M7 10l5-5 5 5M12 5v12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type AuthorDashboardNavProps = {
  authorSlug?: string;
};

export default function AuthorDashboardNav({
  authorSlug,
}: AuthorDashboardNavProps) {
  const pathname = usePathname();
  const authorQuery = authorSlug
    ? `?author=${encodeURIComponent(authorSlug)}`
    : "";

  const items = [
    {
      href: `/author-dashboard${authorQuery}`,
      label: "Продукты",
      icon: ProductsIcon,
      active: pathname === "/author-dashboard",
    },
    {
      href: `/author-dashboard/profile${authorQuery}`,
      label: "Страница автора",
      icon: ProfileIcon,
      active: pathname.startsWith("/author-dashboard/profile"),
    },
    {
      href: `/author-dashboard/promotion${authorQuery}`,
      label: "Продвижение",
      icon: PromotionIcon,
      active: pathname.startsWith("/author-dashboard/promotion"),
    },
  ];

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              item.active
                ? "bg-[#7042c5] text-white"
                : "border border-[#e4d7f4] bg-white text-[#7042c5]"
            }`}
          >
            <Icon />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
