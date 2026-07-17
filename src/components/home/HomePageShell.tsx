import Link from "next/link";
import type { ReactNode } from "react";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import BottomNav from "@/components/BottomNav";
import LegalFooter from "@/components/LegalFooter";
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
        <div className="px-5 pt-4 md:pt-5 lg:px-10 lg:pt-8">
          <header className="border-b border-[#eadff8] pb-3 md:pb-4">
            <div className="flex min-w-0 items-center justify-between gap-3 md:gap-4">
              <AudioladHorizontalLogo priority />

              {!isAuthenticated ? (
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
