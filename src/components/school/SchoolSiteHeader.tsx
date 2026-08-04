import Image from "next/image";
import Link from "next/link";

import UserAvatar from "@/components/profile/UserAvatar";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import type { ListenerShellData } from "@/lib/listener/shell-data";

type SchoolSiteHeaderProps = {
  shellData: ListenerShellData;
};

/** Same compact guest logo treatment as HomeMobileHeader. */
const guestLogoImageClassName =
  "h-auto w-[clamp(6.25rem,38vw,10.3125rem)] max-w-none object-contain object-left md:h-8 md:w-auto";

const guestLogoLinkClassName =
  "inline-flex min-w-0 shrink rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

/** Same guest auth button classes as HomeMobileHeader. */
const authButtonClassName =
  "whitespace-nowrap rounded-full px-[clamp(0.375rem,2vw,0.75rem)] py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

/**
 * School landing top bar: reuses HomeMobileHeader guest auth actions and the
 * ListenerShellData + UserAvatar profile pattern from desktop listener chrome,
 * without BottomNav / mini-player / listener shell.
 */
export default function SchoolSiteHeader({ shellData }: SchoolSiteHeaderProps) {
  const isGuest = !shellData.isAuthenticated;

  return (
    <header className="school-site-header">
      <div
        className={
          isGuest
            ? "school-site-header__row school-site-header__row--guest"
            : "school-site-header__row"
        }
      >
        <Link
          href={PRODUCTION_APP_ORIGIN}
          className={
            isGuest ? guestLogoLinkClassName : "school-site-header__logo-link"
          }
          aria-label="АудиоЛад — на главную"
        >
          <Image
            src="/brand/audiolad-logo-horizontal.png"
            alt="АудиоЛад"
            width={600}
            height={200}
            className={
              isGuest ? guestLogoImageClassName : "school-site-header__logo"
            }
            priority
          />
        </Link>

        {isGuest ? (
          <div className="school-site-header__auth">
            <Link
              href="/auth/sign-in"
              className={`${authButtonClassName} border border-[#bda6e1] text-[#7042c5]`}
            >
              Войти
            </Link>
            <Link
              href="/auth/sign-up"
              className={`${authButtonClassName} bg-[#7042c5] text-white`}
            >
              Регистрация
            </Link>
          </div>
        ) : (
          <Link
            href={shellData.profileHref}
            className="school-site-header__profile"
            aria-label={`Профиль: ${shellData.displayName}`}
          >
            <UserAvatar
              avatarUrl={shellData.avatarUrl}
              initial={shellData.profileInitial}
              size={36}
              className="h-9 w-9 rounded-full bg-[#f3ebfc] text-[13px] font-semibold text-[#7042c5]"
              initialClassName="text-[13px] font-semibold text-[#7042c5]"
            />
            <span className="school-site-header__profile-name">
              {shellData.displayName}
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
