import Link from "next/link";

import type { ListenerShellData } from "@/lib/listener/shell-data";

type HomeMobileHeaderProps = {
  shellData: ListenerShellData;
};

export default function HomeMobileHeader({ shellData }: HomeMobileHeaderProps) {
  return (
    <header className="border-b border-[#eadff8] px-5 pb-4 pt-5 lg:px-10 lg:pt-8 xl:hidden">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-[28px] font-semibold leading-none text-[#6234b5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] lg:text-[30px]"
        >
          АудиоЛад
        </Link>

        {!shellData.isAuthenticated ? (
          <div className="flex shrink-0 gap-2 text-sm">
            <Link
              href="/auth/sign-in"
              className="rounded-full border border-[#bda6e1] px-3 py-1.5 font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Войти
            </Link>
            <Link
              href="/auth/sign-up"
              className="rounded-full bg-[#7042c5] px-3 py-1.5 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Регистрация
            </Link>
          </div>
        ) : null}
      </div>
    </header>
  );
}
