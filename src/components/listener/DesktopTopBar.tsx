import Link from "next/link";

import type { ListenerShellData } from "@/lib/listener/shell-data";

type DesktopTopBarProps = {
  shellData: ListenerShellData;
};

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-[#9485b4]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export default function DesktopTopBar({ shellData }: DesktopTopBarProps) {
  return (
    <header className="flex h-[var(--listener-topbar-height)] min-w-0 shrink-0 items-center gap-3 xl:gap-4">
      <Link
        href="/"
        className="shrink-0 text-[21px] font-semibold leading-none text-[#6234b5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:text-[22px]"
      >
        АудиоЛад
      </Link>

      <Link
        href="/catalog"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-[#eadff8] bg-[#fffdfd] px-4 py-2 text-[14px] text-[#9485b4] shadow-[0_4px_14px_rgba(90,60,145,0.05)] transition hover:border-[#dcc9f2] hover:text-[#796ba0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:text-[15px]"
        aria-label="Поиск практик — перейти в каталог"
      >
        <SearchIcon />
        <span>Поиск практик</span>
      </Link>

      <div className="flex min-w-0 shrink-0 items-center gap-2 xl:gap-3">
        <Link
          href={shellData.authorCta.href}
          className="inline-flex min-h-10 max-w-[11rem] items-center justify-center truncate rounded-full border border-[#d9c4f4] bg-[#faf6ff] px-3 py-2 text-sm font-semibold text-[#7042c5] transition hover:border-[#c9b0ea] hover:bg-[#f3ebfc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:max-w-none xl:px-4"
          title={shellData.authorCta.label}
        >
          {shellData.authorCta.label}
        </Link>

        {shellData.isAuthenticated ? (
          <Link
            href={shellData.profileHref}
            className="inline-flex min-h-10 max-w-[9.5rem] items-center gap-2 rounded-full border border-[#eadff8] bg-[#fffdfd] py-1.5 pl-1.5 pr-3 text-sm font-medium text-[#25135c] shadow-sm transition hover:border-[#dcc9f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:max-w-[11rem] xl:pr-4"
            aria-label={`Профиль: ${shellData.displayName}`}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3ebfc] text-sm font-semibold text-[#7042c5]"
              aria-hidden="true"
            >
              {shellData.profileInitial}
            </span>
            <span className="truncate">{shellData.displayName}</span>
          </Link>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/auth/sign-in"
              className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full border border-[#bda6e1] px-3 py-2 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:px-4"
            >
              Войти
            </Link>
            <Link
              href="/auth/sign-up"
              className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-[#7042c5] px-3 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:px-4"
            >
              Регистрация
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
