"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  ANALYTICS_CONSENT_BANNER_CLASS,
  ANALYTICS_CONSENT_BANNER_Z_INDEX_CLASS,
} from "@/lib/analytics/consent-banner-layout";
import { writeAnalyticsConsent } from "@/lib/analytics/analytics-consent";
import { shouldShowYandexAnalyticsConsentBanner } from "@/lib/analytics/yandex-metrika-environment";
import { useAnalyticsConsent } from "@/lib/analytics/use-analytics-consent";

import { useAdvertisingConsent } from "@/lib/analytics/use-advertising-consent";
import { writeAdvertisingConsent } from "@/lib/analytics/advertising-consent.mjs";
import { consentBannerVariant, applyConsentBannerChoice } from "@/lib/analytics/consent-banner-choice.mjs";

function useClientMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Business hosts have no /privacy route: they pass the absolute audiolad.ru policy URL. */
export default function AnalyticsConsentBanner({
  privacyHref = "/privacy#section-8",
}: {
  privacyHref?: string;
} = {}) {
  const consent = useAnalyticsConsent();
  const advertising = useAdvertisingConsent();
  const variant = consentBannerVariant(consent, advertising);
  const mounted = useClientMounted();

  if (
    !variant ||
    !mounted ||
    !shouldShowYandexAnalyticsConsentBanner()
  ) {
    return null;
  }

  const choose = (action: "allow" | "analytics-only" | "deny") =>
    applyConsentBannerChoice(variant, action, {
      analytics: writeAnalyticsConsent,
      advertising: writeAdvertisingConsent,
    });

  return createPortal(
    <aside
      role="dialog"
      aria-labelledby="analytics-consent-heading"
      aria-describedby="analytics-consent-description"
      className={`fixed left-1/2 ${ANALYTICS_CONSENT_BANNER_CLASS} ${ANALYTICS_CONSENT_BANNER_Z_INDEX_CLASS} w-[min(100%-2rem,430px)] -translate-x-1/2 px-4`}
    >
      <div className="w-full rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-[0_12px_30px_rgba(90,60,145,0.16)]">
        <h2
          id="analytics-consent-heading"
          className="text-[17px] font-semibold leading-snug text-[#25135c]"
        >
          {variant === "all" ? "Cookies на сайте" : variant === "advertising" ? "Рекламные cookies" : "Аналитические cookies"}
        </h2>

        <p
          id="analytics-consent-description"
          className="mt-2 text-sm leading-6 text-[#796ba0]"
        >
          {variant === "all"
            ? "Мы используем Яндекс Метрику для обезличенной статистики посещений и пиксель VK Реклама, чтобы понимать, какая реклама работает, и показывать нашу рекламу тем, кто уже был на сайте. Имя, email и телефон не передаются. Каждый сервис загружается только после вашего согласия. "
            : variant === "advertising"
              ? "Мы используем пиксель VK Реклама, чтобы понимать, какая реклама работает, и показывать нашу рекламу тем, кто уже был на сайте. Имя, email и телефон не передаются. Пиксель загружается только после вашего согласия. "
              : "Для обезличенной статистики посещений мы используем Яндекс Метрику. Персональные данные не передаются. Метрика загружается только после вашего согласия. "}
          {/^https?:\/\//i.test(privacyHref) ? (
            <a href={privacyHref} className="text-[#7042c5] underline">
              Подробнее в политике
            </a>
          ) : (
            <Link href={privacyHref} className="text-[#7042c5] underline">
              Подробнее в политике
            </Link>
          )}
          .
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => choose("allow")}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white"
          >
            {variant === "all" ? "Разрешить все" : "Разрешить"}
          </button>

          {variant === "all" && (
            <button
              type="button"
              onClick={() => choose("analytics-only")}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[#eadff8] px-3 py-2.5 text-sm font-medium text-[#7042c5]"
            >
              Только аналитика
            </button>
          )}

          <button
            type="button"
            onClick={() => choose("deny")}
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
