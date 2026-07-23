"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { usePwaInstall } from "@/components/pwa/PwaInstallProvider";
import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import {
  BOTTOM_NAV_CONTENT_GAP_PX,
  BOTTOM_NAV_MAIN_HEIGHT_PX,
} from "@/lib/navigation/bottom-nav";

type FirstSaveRetentionCardProps = {
  practiceId: string;
  onDismiss: () => void;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function FirstSaveRetentionCard({
  practiceId,
  onDismiss,
}: FirstSaveRetentionCardProps) {
  const pathname = usePathname() ?? "/";
  const { isStandalone, uiVariant, openInstallFlow } = usePwaInstall();
  const isMobile = uiVariant === "mobile";
  const shownTrackedRef = useRef(false);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--bottom-nav-offset",
      `${BOTTOM_NAV_MAIN_HEIGHT_PX + BOTTOM_NAV_CONTENT_GAP_PX}px`,
    );
  }, []);

  useEffect(() => {
    if (shownTrackedRef.current) {
      return;
    }

    shownTrackedRef.current = true;

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId) {
      return;
    }

    void trackPlatformEvent({
      sessionId,
      event_name: "first_save_retention_prompt_shown",
      path: pathname,
      practice_id: practiceId,
    });
  }, [pathname, practiceId]);

  function trackDismiss(): void {
    const sessionId = getCachedAnalyticsSessionId();

    if (sessionId) {
      void trackPlatformEvent({
        sessionId,
        event_name: "first_save_retention_prompt_dismissed",
        path: pathname,
        practice_id: practiceId,
      });
    }

    onDismiss();
  }

  function trackLibraryClick(): void {
    const sessionId = getCachedAnalyticsSessionId();

    if (sessionId) {
      void trackPlatformEvent({
        sessionId,
        event_name: "first_save_retention_prompt_library_clicked",
        path: pathname,
        practice_id: practiceId,
      });
    }
  }

  function handleInstallClick(): void {
    const sessionId = getCachedAnalyticsSessionId();

    if (sessionId) {
      void trackPlatformEvent({
        sessionId,
        event_name: "first_save_retention_prompt_install_clicked",
        path: pathname,
        practice_id: practiceId,
      });
    }

    void openInstallFlow("retention");
  }

  const bottomOffset =
    "calc(var(--global-mini-player-height, 0px) + var(--bottom-nav-offset, 96px) + env(safe-area-inset-bottom, 0px))";

  const installButtonLabel = isMobile ? "Добавить на телефон" : "Установить АудиоЛад";

  return (
    <aside
      role="region"
      aria-label="Практика сохранена в Аудиотеке"
      className="pointer-events-none fixed inset-x-0 z-[20] flex justify-center px-4"
      style={{ bottom: bottomOffset }}
    >
      <div className="pointer-events-auto w-full max-w-[430px] rounded-[22px] border border-[#d9c7f4] bg-gradient-to-br from-[#fffaff] to-[#f4ecfb] p-4 shadow-[0_12px_30px_rgba(90,60,145,0.16)] lg:max-w-[560px] lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-semibold leading-snug text-[#25135c] lg:text-[18px]">
            Практика сохранена ✓
          </h2>
          <button
            type="button"
            onClick={trackDismiss}
            className="shrink-0 rounded-full p-1 text-[#7d70a2] hover:bg-[#efe6fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="mt-2 text-sm leading-6 text-[#5f4a8f]">
          Теперь эта практика всегда будет храниться в вашей Аудиотеке. Откройте
          АудиоЛад на телефоне или компьютере и войдите с тем же email – она уже
          будет ждать вас.
        </p>

        {!isStandalone && isMobile ? (
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Добавьте АудиоЛад на главный экран телефона – так он всегда будет под
            рукой.
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href="/my-practices"
            onClick={trackLibraryClick}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Открыть мою Аудиотеку
          </Link>

          {!isStandalone ? (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#dcccf5] px-4 py-2.5 text-sm font-medium text-[#7042c5] hover:bg-[#f7f1fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              {installButtonLabel}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
