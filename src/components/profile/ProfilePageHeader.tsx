import Link from "next/link";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import { profilePageFullWidthClassName } from "@/lib/profile/layout";

export default function ProfilePageHeader() {
  return (
    <header
      className={`flex min-w-0 items-center justify-between gap-3 md:gap-4 ${profilePageFullWidthClassName}`}
    >
      <AudioladHorizontalLogo variant="profile" />

      <h1 className="text-[28px] font-semibold lg:text-[30px]">Профиль</h1>

      <Link
        href="/settings"
        aria-label="Настройки"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-2xl text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        ⚙
      </Link>
    </header>
  );
}
