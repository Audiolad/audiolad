"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { writeAnalyticsConsent } from "@/lib/analytics/analytics-consent";
import { useAnalyticsConsent } from "@/lib/analytics/use-analytics-consent";

function useClientMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function AnalyticsConsentBanner() {
  const consent = useAnalyticsConsent();
  const mounted = useClientMounted();

  if (consent !== "unknown" || !mounted) {
    return null;
  }

  return createPortal(
    <aside
      role="dialog"
      aria-labelledby="analytics-consent-heading"
      aria-describedby="analytics-consent-description"
      className="fixed bottom-0 left-1/2 z-[21] w-[min(100%-2rem,430px)] -translate-x-1/2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
    >
      <div className="w-full rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-[0_12px_30px_rgba(90,60,145,0.16)]">
        <h2
          id="analytics-consent-heading"
          className="text-[17px] font-semibold leading-snug text-[#25135c]"
        >
          Аналитические cookies
        </h2>

        <p
          id="analytics-consent-description"
          className="mt-2 text-sm leading-6 text-[#796ba0]"
        >
          Для обезличенной статистики посещений мы используем Яндекс Метрику.
          Персональные данные не передаются. Метрика загружается только после
          вашего согласия.{" "}
          <Link href="/privacy#section-8" className="text-[#7042c5] underline">
            Подробнее в политике
          </Link>
          .
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => writeAnalyticsConsent("granted")}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white"
          >
            Разрешить
          </button>

          <button
            type="button"
            onClick={() => writeAnalyticsConsent("denied")}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[#eadff8] px-5 py-2.5 text-sm font-medium text-[#7042c5]"
          >
            Отклонить
          </button>
        </div>
      </div>
    </aside>,
    document.body,
  );
}
