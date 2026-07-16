"use client";

import { GlobalAudioPlayerProvider } from "@/components/audio/GlobalAudioPlayerProvider";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import PwaInstallErrorBoundary from "@/components/pwa/PwaInstallErrorBoundary";
import PwaInstallProvider from "@/components/pwa/PwaInstallProvider";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GlobalAudioPlayerProvider>
      <ClientErrorReporter />
      <PwaInstallErrorBoundary appChildren={children}>
        <PwaInstallProvider>{children}</PwaInstallProvider>
      </PwaInstallErrorBoundary>
    </GlobalAudioPlayerProvider>
  );
}
