"use client";

import BottomNav from "@/components/BottomNav";
import { AuthBrand, AuthFrame, useAuthVariant } from "@/components/auth/AuthPresentation";
import { authVariantLinkParams } from "@/components/auth/variant";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { PASSWORD_RESET_EXPIRED_MESSAGE } from "@/lib/auth/recovery-messages";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function PasswordResetExpired() {
  const variant = useAuthVariant();
  const searchParams = useSearchParams();
  return (
    <AuthFrame variant={variant}>
      <div className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface px-5 pt-8 ${platformNavPaddingClass}`}>
        <header className="text-center">
          <AuthBrand variant={variant} />
          <h1 className="mt-8 text-[30px] font-semibold">Смена пароля</h1>
        </header>
        <div role="alert" className="mt-8 rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-4 text-sm leading-6 text-[#b34f63]">
          {PASSWORD_RESET_EXPIRED_MESSAGE}
        </div>
        <p className="mt-6 text-center text-sm text-[#7d70a2]">
          <Link href={variant === "business"
            ? buildAuthRouteHref("/auth/forgot-password", searchParams.get("next"), authVariantLinkParams(variant))
            : "/auth/forgot-password"} className="font-semibold text-[#7042c5]">Запросить новую ссылку</Link>
        </p>
        {variant === "ordinary" ? <BottomNav /> : null}
      </div>
    </AuthFrame>
  );
}
