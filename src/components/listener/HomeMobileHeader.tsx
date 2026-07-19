import Link from "next/link";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import type { ListenerShellData } from "@/lib/listener/shell-data";

type HomeMobileHeaderProps = {
  shellData: ListenerShellData;
};

/** Guest home mobile: adaptive logo width so auth buttons stay fully visible. */
const guestHomeMobileLogoImageClassName =
  "h-auto w-[clamp(6.25rem,38vw,10.3125rem)] max-w-none object-contain object-left";

const guestHomeMobileLogoLinkClassName =
  "inline-flex min-w-0 shrink rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const guestHomeMobileAuthButtonClassName =
  "whitespace-nowrap rounded-full px-[clamp(0.375rem,2vw,0.75rem)] py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

export default function HomeMobileHeader({ shellData }: HomeMobileHeaderProps) {
  const isGuest = !shellData.isAuthenticated;

  return (
    <header className="border-b border-[#eadff8] px-5 pb-3 pt-4 md:pb-4 md:pt-5 lg:px-10 lg:pt-8 xl:hidden">
      <div
        className={
          isGuest
            ? "flex min-w-0 items-center gap-2"
            : "flex min-w-0 items-center justify-between gap-3 md:gap-4"
        }
      >
        <AudioladHorizontalLogo
          priority
          className={isGuest ? guestHomeMobileLogoImageClassName : undefined}
          linkClassName={isGuest ? guestHomeMobileLogoLinkClassName : undefined}
        />

        {isGuest ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/auth/sign-in"
              className={`${guestHomeMobileAuthButtonClassName} border border-[#bda6e1] text-[#7042c5]`}
            >
              Войти
            </Link>
            <Link
              href="/auth/sign-up"
              className={`${guestHomeMobileAuthButtonClassName} bg-[#7042c5] text-white`}
            >
              Регистрация
            </Link>
          </div>
        ) : null}
      </div>
    </header>
  );
}
