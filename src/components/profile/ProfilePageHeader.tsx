import Image from "next/image";
import Link from "next/link";

import { profilePageFullWidthClassName } from "@/lib/profile/layout";

export default function ProfilePageHeader() {
  return (
    <header
      className={`flex items-center justify-between ${profilePageFullWidthClassName}`}
    >
      <Image
        src="/audiolad-logo.png"
        alt="АудиоЛад"
        width={48}
        height={48}
        className="h-12 w-12 object-contain"
      />

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
