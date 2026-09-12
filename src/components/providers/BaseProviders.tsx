"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import AnalyticsAuthLinker from "@/components/analytics/AnalyticsAuthLinker";
import AnalyticsConsentBanner from "@/components/analytics/AnalyticsConsentBanner";
import PlatformAnalyticsProvider from "@/components/analytics/PlatformAnalyticsProvider";
import YandexMetrika from "@/components/analytics/YandexMetrika";
import ClientErrorReporter from "@/components/ClientErrorReporter";

export default function BaseProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Recovery/reset pages accept security credentials. Keep them isolated from
  // analytics, telemetry and any third-party script while the flow is active.
  if (
    pathname === "/auth/recovery" ||
    pathname === "/auth/reset-password"
  ) {
    return <>{children}</>;
  }

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
