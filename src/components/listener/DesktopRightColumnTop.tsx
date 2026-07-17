import Link from "next/link";

import type { ListenerShellData } from "@/lib/listener/shell-data";

type DesktopRightColumnTopProps = {
  shellData: ListenerShellData;
};

export default function DesktopRightColumnTop({
  shellData,
}: DesktopRightColumnTopProps) {
  return (
    <div className="flex h-14 min-h-14 shrink-0 items-center gap-2 border-b border-[#f0e8f8] px-4">
      <Link
        href={shellData.authorCta.href}
        className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center truncate rounded-full border border-[#d9c4f4] bg-[#faf6ff] px-3 py-2 text-sm font-semibold text-[#7042c5] transition hover:border-[#c9b0ea] hover:bg-[#f3ebfc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        title={shellData.authorCta.label}
      >
        {shellData.authorCta.label}
      </Link>

      {shellData.isAuthenticated ? (
        <Link
          href={shellData.profileHref}
          className="inline-flex min-h-10 min-w-0 max-w-[9.5rem] shrink-0 items-center gap-2 rounded-full border border-[#eadff8] bg-[#fffdfd] py-1.5 pl-1.5 pr-3 text-sm font-medium text-[#25135c] shadow-sm transition hover:border-[#dcc9f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
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
        <div className="flex shrink-0 items-center gap-1.5 text-sm">
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full border border-[#bda6e1] px-3 py-2 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Войти
          </Link>
          <Link
            href="/auth/sign-up"
            className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-[#7042c5] px-3 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Регистрация
          </Link>
        </div>
      )}
    </div>
  );
}
