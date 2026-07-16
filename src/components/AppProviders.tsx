"use client";

import { GlobalAudioPlayerProvider } from "@/components/audio/GlobalAudioPlayerProvider";
import AnalyticsAuthLinker from "@/components/analytics/AnalyticsAuthLinker";
import PlatformAnalyticsProvider from "@/components/analytics/PlatformAnalyticsProvider";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import PwaInstallErrorBoundary from "@/components/pwa/PwaInstallErrorBoundary";
import PwaInstallProvider from "@/components/pwa/PwaInstallProvider";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlatformAnalyticsProvider>
      <GlobalAudioPlayerProvider>
        <AnalyticsAuthLinker />
        <ClientErrorReporter />
        <PwaInstallErrorBoundary appChildren={children}>
          <PwaInstallProvider>{children}</PwaInstallProvider>
        </PwaInstallErrorBoundary>
      </GlobalAudioPlayerProvider>
    </PlatformAnalyticsProvider>
  );
}
