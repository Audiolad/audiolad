"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAnalyticsConsentGranted } from "@/lib/analytics/use-analytics-consent";
import {
  getYandexMetrikaCounterId,
  initYandexMetrika,
  reachYandexMetrikaHit,
} from "@/lib/analytics/yandex-metrika";

function YandexMetrikaTracker({ scriptReady }: { scriptReady: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const skipInitialHit = useRef(true);

  const pageUrl = useMemo(() => {
    const query = searchParams.toString();

    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!scriptReady) {
      return;
    }

    if (skipInitialHit.current) {
      skipInitialHit.current = false;
      return;
    }

    reachYandexMetrikaHit(pageUrl);
  }, [pageUrl, scriptReady]);

  return null;
}

export default function YandexMetrika() {
  const counterId = getYandexMetrikaCounterId();
  const consentGranted = useAnalyticsConsentGranted();
  const [scriptReady, setScriptReady] = useState(false);

  if (!counterId || !consentGranted) {
    return null;
  }

  return (
    <>
      <Script
        id="yandex-metrika-tag"
        src="https://mc.yandex.ru/metrika/tag.js"
        strategy="afterInteractive"
        onLoad={() => {
          initYandexMetrika(counterId);
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
