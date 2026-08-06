"use client";

import type { ReactNode } from "react";

import { GlobalAudioPlayerProvider } from "@/components/audio/GlobalAudioPlayerProvider";
import PwaInstallErrorBoundary from "@/components/pwa/PwaInstallErrorBoundary";
import PwaInstallProvider from "@/components/pwa/PwaInstallProvider";
import FirstSaveRetentionProvider, {
  FirstSaveRetentionHost,
} from "@/components/retention/FirstSaveRetentionProvider";

export default function PlatformProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <GlobalAudioPlayerProvider>
      <FirstSaveRetentionProvider>
        <PwaInstallErrorBoundary
          appChildren={
            <>
              {children}
              <FirstSaveRetentionHost />
            </>
          }
        >
          <PwaInstallProvider>
            {children}
            <FirstSaveRetentionHost />
          </PwaInstallProvider>
        </PwaInstallErrorBoundary>
      </FirstSaveRetentionProvider>
    </GlobalAudioPlayerProvider>
  );
}
