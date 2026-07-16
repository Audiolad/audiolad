import Link from "next/link";
import type { ReactNode } from "react";

type AdminShellProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
};

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminShell({
  title,
  subtitle,
  backHref = "/profile",
  backLabel = "Назад в профиль",
  children,
}: AdminShellProps) {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[960px] bg-platform-surface px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] lg:px-8">
        <header className="flex items-start justify-between gap-3">
          <Link
            href={backHref}
            aria-label={backLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
          >
            <BackIcon />
          </Link>

          <div className="min-w-0 flex-1 text-center">
            <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
            {subtitle ? (
              <p className="mt-1 text-xs text-[#7d70a2]">{subtitle}</p>
            ) : null}
          </div>

          <div className="h-11 w-11 shrink-0" aria-hidden="true" />
        </header>

        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
