import Link from "next/link";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import type { ListenerShellData } from "@/lib/listener/shell-data";

type HomeMobileHeaderProps = {
  shellData: ListenerShellData;
};

export default function HomeMobileHeader({ shellData }: HomeMobileHeaderProps) {
  return (
    <header className="border-b border-[#eadff8] px-5 pb-3 pt-4 md:pb-4 md:pt-5 lg:px-10 lg:pt-8 xl:hidden">
      <div className="flex min-w-0 items-center justify-between gap-3 md:gap-4">
        <AudioladHorizontalLogo priority />

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
