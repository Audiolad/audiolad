"use client";

import { Suspense, type ReactNode } from "react";

import AnalyticsAuthLinker from "@/components/analytics/AnalyticsAuthLinker";
import AnalyticsConsentBanner from "@/components/analytics/AnalyticsConsentBanner";
import PlatformAnalyticsProvider from "@/components/analytics/PlatformAnalyticsProvider";
import YandexMetrika from "@/components/analytics/YandexMetrika";
import ClientErrorReporter from "@/components/ClientErrorReporter";

export default function BaseProviders({ children }: { children: ReactNode }) {
  return (
    <PlatformAnalyticsProvider>
      <Suspense fallback={null}>
        <YandexMetrika />
      </Suspense>
      <AnalyticsAuthLinker />
      <ClientErrorReporter />
      {children}
      <AnalyticsConsentBanner />
    </PlatformAnalyticsProvider>
  );
}
