"use client";

import { GlobalAudioPlayerProvider } from "@/components/audio/GlobalAudioPlayerProvider";
import PwaInstallProvider from "@/components/pwa/PwaInstallProvider";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GlobalAudioPlayerProvider>
      <PwaInstallProvider>{children}</PwaInstallProvider>
    </GlobalAudioPlayerProvider>
  );
}
