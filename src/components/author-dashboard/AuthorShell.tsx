import Link from "next/link";
import type { ReactNode } from "react";

type AuthorShellProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  /** Optional in-section back link used by personal diagnostics editor/create. */
  internalBackHref?: string;
  internalBackLabel?: string;
  children: ReactNode;
  actions?: ReactNode;
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

export default function AuthorShell({
  title,
  subtitle,
  backHref = "/author-dashboard",
  backLabel = "Назад",
  internalBackHref,
  internalBackLabel = "Назад",
  children,
  actions,
}: AuthorShellProps) {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className="mx-auto min-h-screen w-full min-w-0 max-w-[720px] bg-platform-surface px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
        <header className="flex min-w-0 items-start justify-between gap-3">
          <Link
            href={backHref}
            aria-label={backLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
          >
            <BackIcon />
          </Link>

          <div className="min-w-0 flex-1 overflow-hidden text-center">
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
          <div className="mt-4 min-w-0">
            <Link
              href={internalBackHref}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#7042c5]"
            >
              <BackIcon />
              {internalBackLabel}
            </Link>
          </div>
        ) : null}

        <div className="mt-6 min-w-0">{children}</div>
      </div>
    </main>
  );
}
