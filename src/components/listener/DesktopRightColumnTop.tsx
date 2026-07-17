import Link from "next/link";

import type { ListenerShellData } from "@/lib/listener/shell-data";

type DesktopRightColumnTopProps = {
  shellData: ListenerShellData;
};

function AuthorOutlineIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export default function DesktopRightColumnTop({
  shellData,
}: DesktopRightColumnTopProps) {
  return (
    <div className="flex shrink-0 flex-col gap-2.5">
      {shellData.isAuthenticated ? (
        <Link
          href={shellData.profileHref}
          className="flex min-h-[72px] items-center gap-3 rounded-[16px] border border-[#eadff8] bg-[#fffdfd] px-3 py-2.5 transition hover:border-[#dcc9f2] hover:bg-[#fdfbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          aria-label={`Профиль: ${shellData.displayName}`}
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3ebfc] text-[15px] font-semibold text-[#7042c5]"
            aria-hidden="true"
          >
            {shellData.profileInitial}
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-[#25135c]">
            {shellData.displayName}
          </span>
        </Link>
      ) : (
        <div className="flex min-h-[72px] items-center gap-2">
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[14px] border border-[#dcc9f2] px-3 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Войти
          </Link>
          <Link
            href="/auth/sign-up"
            className="inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[14px] bg-[#7042c5] px-3 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Регистрация
          </Link>
        </div>
      )}

      <Link
        href={shellData.authorCta.href}
        className="inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[#e8ddf5] bg-[#faf7fd] px-3 text-sm font-semibold text-[#7042c5] transition hover:border-[#dcc9f2] hover:bg-[#f3ebfc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        title={shellData.authorCta.label}
      >
        <AuthorOutlineIcon />
        <span className="truncate">{shellData.authorCta.label}</span>
      </Link>
    </div>
  );
}
