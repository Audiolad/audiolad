"use client";

import { useEffect } from "react";

import {
  BOTTOM_NAV_CONTENT_GAP_PX,
  BOTTOM_NAV_MAIN_HEIGHT_PX,
} from "@/lib/navigation/bottom-nav";
import { usePwaBrowserEnvironment } from "@/lib/pwa/browser-environment";
import { getMobileInstallBannerHint } from "@/lib/pwa/platform";

import { usePwaInstall } from "@/components/pwa/PwaInstallProvider";

export default function PwaInstallBanner() {
  const { isBannerVisible, uiVariant, openInstallFlow, remindLater } =
    usePwaInstall();
  const { platform, isInApp } = usePwaBrowserEnvironment();

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--bottom-nav-offset",
      `${BOTTOM_NAV_MAIN_HEIGHT_PX + BOTTOM_NAV_CONTENT_GAP_PX}px`,
    );
  }, []);

  if (!isBannerVisible) {
    return null;
  }

  const isMobile = uiVariant === "mobile";
  const mobileHint = getMobileInstallBannerHint({ platform, isInApp });

  const bottomOffset =
    "calc(var(--global-mini-player-height, 0px) + var(--bottom-nav-offset, 96px) + env(safe-area-inset-bottom, 0px))";

  return (
    <aside
      role="region"
      aria-label="Установка АудиоЛад"
      className="pointer-events-none fixed inset-x-0 z-[19] flex justify-center px-4"
      style={{ bottom: bottomOffset }}
    >
      <div className="pointer-events-auto w-full max-w-[430px] rounded-[22px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] to-[#f2e6fb] p-4 shadow-[0_12px_30px_rgba(90,60,145,0.14)] lg:max-w-[560px] lg:p-5">
        <h2 className="text-[17px] font-semibold leading-snug text-[#25135c] lg:text-[18px]">
          {isMobile
            ? "АудиоЛад всегда под рукой"
            : "Сохраните АудиоЛад на компьютере"}
        </h2>

        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          {isMobile
            ? mobileHint
            : "Установите приложение или сохраните страницу, чтобы открывать аудиотеку в один клик."}
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => void openInstallFlow("banner")}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {isMobile ? "Добавить на экран" : "Установить АудиоЛад"}
          </button>

          <button
            type="button"
            onClick={remindLater}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium text-[#7042c5] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Напомнить позже
          </button>
        </div>
      </div>
    </aside>
  );
}
