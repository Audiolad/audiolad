"use client";

import { Suspense } from "react";

import { GlobalAudioPlayerProvider } from "@/components/audio/GlobalAudioPlayerProvider";
import AnalyticsAuthLinker from "@/components/analytics/AnalyticsAuthLinker";
import PlatformAnalyticsProvider from "@/components/analytics/PlatformAnalyticsProvider";
import AnalyticsConsentBanner from "@/components/analytics/AnalyticsConsentBanner";
import YandexMetrika from "@/components/analytics/YandexMetrika";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import FirstSaveRetentionProvider from "@/components/retention/FirstSaveRetentionProvider";
import PwaInstallErrorBoundary from "@/components/pwa/PwaInstallErrorBoundary";
import PwaInstallProvider from "@/components/pwa/PwaInstallProvider";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlatformAnalyticsProvider>
      <Suspense fallback={null}>
        <YandexMetrika />
      </Suspense>
      <GlobalAudioPlayerProvider>
        <AnalyticsAuthLinker />
        <ClientErrorReporter />
        <PwaInstallErrorBoundary appChildren={children}>
          <PwaInstallProvider>
            <FirstSaveRetentionProvider>{children}</FirstSaveRetentionProvider>
          </PwaInstallProvider>
        </PwaInstallErrorBoundary>
      </GlobalAudioPlayerProvider>
      <AnalyticsConsentBanner />
    </PlatformAnalyticsProvider>
  );
}
