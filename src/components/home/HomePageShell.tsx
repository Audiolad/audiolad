import Link from "next/link";
import type { ReactNode } from "react";

import BottomNav from "@/components/BottomNav";
import LegalFooter from "@/components/LegalFooter";
import PrimaryNav from "@/components/PrimaryNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

type HomePageShellProps = {
  children: ReactNode;
  isAuthenticated: boolean;
};

export default function HomePageShell({
  children,
  isAuthenticated,
}: HomePageShellProps) {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface lg:max-w-[1200px] ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-5 lg:px-10 lg:pt-8">
          <header className="border-b border-[#eadff8] pb-5">
            <div className="flex items-start justify-between gap-4">
              <Link
                href="/"
                className="text-[28px] font-semibold leading-none text-[#6234b5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] lg:text-[30px]"
              >
                АудиоЛад
              </Link>

              {!isAuthenticated ? (
                <div className="flex shrink-0 gap-2 pt-1 text-sm">
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

            <PrimaryNav className="mt-5 hidden items-center gap-8 lg:flex" />
          </header>

          {children}
        </div>

        <div className="px-5 pb-6 lg:px-10">
          <LegalFooter className="mt-6" />
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
