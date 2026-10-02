"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import AuthorProjectSwitcher from "@/components/author-dashboard/AuthorProjectSwitcher";
import { useAuthorSupportMode } from "@/components/author-support/AuthorSupportModeProvider";
import { canAccessAuthorPartnerYour20Ui } from "@/lib/author-partner/access";
import { audioSprintHref } from "@/lib/seo-queries/audio-sprint";
import { isAuthorSeoDiscoveryEnabled } from "@/lib/seo-queries/discovery-beta";

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

function SeoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15 15 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AudioSprintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M12 4c2 3 2 5 0 8 3-1 5-1 8 1-3 1-5 3-5 7-2-3-4-4-7-4 2-2 3-4 4-12Z"
        fill="#E0892A"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
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

function PercentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="16.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M17 6 7 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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

const AUTUMN_NAV_LABEL = "Осень звучит";

function dashboardNavLinkClass(active: boolean, autumn: boolean) {
  if (!autumn) {
    return `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      active
        ? "bg-[#7042c5] text-white"
        : "border border-[#e4d7f4] bg-white text-[#7042c5]"
    }`;
  }

  return `inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold text-[#25135c] shadow-[0_2px_6px_rgba(176,116,24,0.2)] transition-colors ${
    active
      ? "border-[#D08928] bg-gradient-to-r from-[#F6D07A] to-[#E39A2E] hover:from-[#F3C560] hover:to-[#DB8E20]"
      : "border-[#E4B24A] bg-gradient-to-r from-[#FFF3D6] to-[#F6C76A] hover:border-[#D9A33A] hover:from-[#FFE8B6] hover:to-[#F0B44A]"
  }`;
}

type AuthorDashboardNavProps = {
  authorSlug?: string;
  authorId?: string;
  /** Owner/editor role of the current workspace; used to show the partner tab. */
  authorRole?: "owner" | "editor" | string | null;
};

export default function AuthorDashboardNav({
  authorSlug,
  authorId,
  authorRole,
}: AuthorDashboardNavProps) {
  const pathname = usePathname();
  const supportMode = useAuthorSupportMode();
  const authorQuery = authorSlug
    ? `?author=${encodeURIComponent(authorSlug)}`
    : "";
  const discoveryEnabled = isAuthorSeoDiscoveryEnabled(authorId);

  const items = [
    {
      href: `/author-dashboard${authorQuery}`,
      label: "Продукты",
      icon: ProductsIcon,
      active:
        pathname === "/author-dashboard" ||
        pathname.startsWith("/author-dashboard/music") ||
        pathname.startsWith("/author-dashboard/products"),
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
      href: `/author-dashboard/seo-opportunities${authorQuery}`,
      label: discoveryEnabled ? "Что ищут слушатели" : "SEO-возможности",
      icon: SeoIcon,
      active: pathname.startsWith("/author-dashboard/seo-opportunities"),
    },
    {
      href: audioSprintHref(authorSlug),
      label: AUTUMN_NAV_LABEL,
      icon: AudioSprintIcon,
      active: pathname.startsWith("/author-dashboard/audio-sprints"),
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
    ...(canAccessAuthorPartnerYour20Ui({
      authorSlug,
      role: authorRole,
      isSupportMode: supportMode,
    })
      ? [
          {
            href: `/author-dashboard/your-20${authorQuery}`,
            label: "Ваши 20%",
            icon: PercentIcon,
            active: pathname.startsWith("/author-dashboard/your-20"),
          },
        ]
      : []),
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
          const autumn = item.label === AUTUMN_NAV_LABEL;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={dashboardNavLinkClass(item.active, autumn)}
            >
              <Icon />
              {item.label}
              {autumn ? (
                <span className="hidden h-4 shrink-0 items-center rounded-full bg-[#25135c] px-1.5 text-[10px] font-semibold leading-none text-[#FFF8EA] sm:inline-flex">
                  до 18 октября
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
