import Link from "next/link";
import type { ReactNode } from "react";

type AuthorShellProps = {
  title: string;
  subtitle?: string;
  internalBackHref?: string;
  internalBackLabel?: string;
  children: ReactNode;
  actions?: ReactNode;
};

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      aria-hidden="true"
    >
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

export default function AuthorShell({
  title,
  subtitle,
  internalBackHref,
  internalBackLabel = "Назад в кабинет",
  children,
  actions,
}: AuthorShellProps) {
  return (
    <div className="listener-author-shell mx-auto w-full min-w-0 max-w-[960px] px-5 pb-8 pt-[calc(1rem+env(safe-area-inset-top,0px))] xl:max-w-none xl:px-6 xl:pb-8 xl:pt-4">
      <header className="flex min-w-0 max-w-full items-start justify-between gap-2 sm:gap-3">
        <div className="h-11 w-11 shrink-0" aria-hidden="true" />

        <div className="min-w-0 flex-1 overflow-hidden px-1 text-center">
          <h1 className="truncate text-[22px] font-semibold leading-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 truncate text-xs text-[#7d70a2]">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center">
          {actions}
        </div>
      </header>

      {internalBackHref ? (
        <div className="mt-4">
          <Link
            href={internalBackHref}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <BackIcon />
            {internalBackLabel}
          </Link>
        </div>
      ) : null}

      <div className="mt-6 min-w-0">{children}</div>
    </div>
  );
}
