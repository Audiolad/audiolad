"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import AuthorProjectSwitcher from "@/components/author-dashboard/AuthorProjectSwitcher";

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

function DiagnosticsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M7 7h10M7 12h6M7 17h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M5 19V10M12 19V5M19 19v-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FinanceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M8 8h6a3 3 0 0 1 0 6H8m0-6v10m0-4h7M6 6h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 8v4l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M8 7h8M8 12h8M8 17h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="4"
        width="14"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
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
      href: `/author-dashboard/diagnostics${authorQuery}`,
      label: "Личная работа",
      icon: DiagnosticsIcon,
      active: pathname.startsWith("/author-dashboard/diagnostics"),
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
    {
      href: `/author-dashboard/stats${authorQuery}`,
      label: "Статистика",
      icon: StatsIcon,
      active: pathname.startsWith("/author-dashboard/stats"),
    },
    {
      href: `/author-dashboard/finance${authorQuery}`,
      label: "Продажи и финансы",
      icon: FinanceIcon,
      active: pathname.startsWith("/author-dashboard/finance"),
    },
    {
      href: `/author-dashboard/status${authorQuery}`,
      label: "Статус",
      icon: StatusIcon,
      active: pathname.startsWith("/author-dashboard/status"),
    },
    {
      href: `/author-dashboard/legal${authorQuery}`,
      label: "Документы",
      icon: DocumentsIcon,
      active: pathname.startsWith("/author-dashboard/legal"),
    },
  ];

  return (
    <div className="space-y-3">
      <Suspense
        fallback={
          <div className="rounded-[18px] border border-[#eadff8] bg-white px-4 py-3 text-sm text-[#7d70a2]">
            Загрузка проектов…
          </div>
        }
      >
        <AuthorProjectSwitcher currentSlug={authorSlug} />
      </Suspense>
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
    </div>
  );
}
