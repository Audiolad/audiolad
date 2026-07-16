"use client";

import Link from "next/link";

import { writeAnalyticsConsent } from "@/lib/analytics/analytics-consent";
import { useAnalyticsConsent } from "@/lib/analytics/use-analytics-consent";

export default function AnalyticsConsentBanner() {
  const consent = useAnalyticsConsent();

  if (consent !== "unknown") {
    return null;
  }

  return (
    <aside
      role="dialog"
      aria-labelledby="analytics-consent-heading"
      aria-describedby="analytics-consent-description"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[21] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
    >
      <div className="pointer-events-auto w-full max-w-[430px] rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-[0_12px_30px_rgba(90,60,145,0.16)]">
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
    </aside>
  );
}
