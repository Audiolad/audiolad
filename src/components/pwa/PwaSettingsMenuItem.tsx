"use client";

import { useCallback } from "react";

import { usePwaInstall } from "@/components/pwa/PwaInstallProvider";

type PwaSettingsMenuItemProps = {
  variant?: "profile" | "settings";
};

export default function PwaSettingsMenuItem({
  variant = "profile",
}: PwaSettingsMenuItemProps) {
  const { openInstallFlow, installState, isStandalone } = usePwaInstall();

  const isInstalled = installState === "installed_confirmed" || isStandalone;

  const description = isInstalled
    ? "АудиоЛад уже добавлен на это устройство"
    : variant === "settings"
      ? "Добавьте приложение на экран или в браузер"
      : "Установите приложение на это устройство";

  const handleInstallClick = useCallback(() => {
    void openInstallFlow("menu");
  }, [openInstallFlow]);

  const actionLabel = isInstalled
    ? "Показать статус установки АудиоЛад"
    : "Установить АудиоЛад";

  if (variant === "settings") {
    return (
      <button
        type="button"
        aria-label={actionLabel}
        onClick={handleInstallClick}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[#faf6ff] active:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f4ecfb] text-[#7042c5]">
            ↓
          </span>

          <span className="min-w-0">
            <span className="block font-medium">Установить АудиоЛад</span>
            <span className="mt-1 block text-xs leading-5 text-[#7d70a2]">
              {description}
            </span>
          </span>
        </span>

        <span className="shrink-0 text-xl text-[#7042c5]" aria-hidden="true">
          ›
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={actionLabel}
      onClick={handleInstallClick}
      className="flex min-h-[56px] w-full cursor-pointer items-center justify-between border-b border-[#eee6f7] px-5 py-4 text-left transition-colors hover:bg-[#faf6ff] active:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5]"
    >
      <span className="text-[15px] leading-6 text-[#25135c]">
        Установить АудиоЛад
      </span>
      <span className="max-w-[52%] truncate text-right text-xs text-[#7d70a2]">
        {description}
      </span>
    </button>
  );
}
