"use client";

import {
  useAnalyticsConsent,
  useAnalyticsConsentGranted,
} from "@/lib/analytics/use-analytics-consent";
import { writeAnalyticsConsent } from "@/lib/analytics/analytics-consent";

export default function AnalyticsPrivacySection() {
  const consent = useAnalyticsConsent();
  const granted = useAnalyticsConsentGranted();

  const description =
    consent === "unknown"
      ? "Метрика не загружается, пока вы не дадите согласие на сайте или здесь."
      : consent === "granted"
        ? "Яндекс Метрика включена. Персональные данные не передаются."
        : "Яндекс Метрика отключена. Внутренняя аналитика платформы продолжает работать.";

  return (
    <section className="mt-8" aria-labelledby="settings-privacy-heading">
      <h2 id="settings-privacy-heading" className="text-[20px] font-semibold">
        Конфиденциальность
      </h2>

      <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <span className="min-w-0">
            <span className="block font-medium">Аналитические cookies</span>
            <span className="mt-1 block text-xs leading-5 text-[#7d70a2]">
              {description}
            </span>
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={granted}
            aria-label="Аналитические cookies"
            onClick={() => {
              writeAnalyticsConsent(granted ? "denied" : "granted");
            }}
            className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition ${
              granted ? "bg-[#7042c5]" : "bg-[#d8c9ef]"
            }`}
          >
            <span
              className={`h-6 w-6 rounded-full bg-white transition ${
                granted ? "translate-x-5" : "translate-x-0"
              }`}
              aria-hidden
            />
          </button>
        </div>
      </div>
    </section>
  );
}
