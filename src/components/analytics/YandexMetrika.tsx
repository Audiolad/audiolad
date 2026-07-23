"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAnalyticsConsentGranted } from "@/lib/analytics/use-analytics-consent";
import { shouldEnableYandexMetrika } from "@/lib/analytics/yandex-metrika-environment";
import {
  getYandexMetrikaCounterId,
  initYandexMetrika,
  reachYandexMetrikaHit,
  resetYandexMetrikaForTests,
} from "@/lib/analytics/yandex-metrika";

function YandexMetrikaTracker({ scriptReady }: { scriptReady: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const skipInitialHit = useRef(true);

  const pagePath = useMemo(() => pathname || "/", [pathname]);

  useEffect(() => {
    if (!scriptReady) {
      return;
    }

    if (skipInitialHit.current) {
      skipInitialHit.current = false;
      return;
    }

    reachYandexMetrikaHit(pagePath, searchParams);
  }, [pagePath, scriptReady, searchParams]);

  return null;
}

export default function YandexMetrika() {
  const pathname = usePathname();
  const counterId = getYandexMetrikaCounterId();
  const consentGranted = useAnalyticsConsentGranted();
  const [scriptReady, setScriptReady] = useState(false);
  const metrikaEnabled = shouldEnableYandexMetrika({
    pathname,
    hostname: typeof window !== "undefined" ? window.location.hostname : null,
  });

  useEffect(() => {
    if (!scriptReady || !counterId || !consentGranted || !metrikaEnabled) {
      return;
    }

    initYandexMetrika(counterId, pathname);
  }, [consentGranted, counterId, metrikaEnabled, pathname, scriptReady]);

  if (!counterId || !consentGranted || !metrikaEnabled) {
    return null;
  }

  return (
    <>
      <Script id="yandex-metrika-stub" strategy="afterInteractive">
        {`
window.ym=window.ym||function(){(window.ym.a=window.ym.a||[]).push(arguments);};
window.ym.l=Date.now();
        `}
      </Script>
      <Script
        id="yandex-metrika-tag"
        src="https://mc.yandex.ru/metrika/tag.js"
        strategy="afterInteractive"
        onLoad={() => {
          initYandexMetrika(counterId, pathname);
          setScriptReady(true);
        }}
      />
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${counterId}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
      <YandexMetrikaTracker scriptReady={scriptReady} />
    </>
  );
}

export { resetYandexMetrikaForTests };
