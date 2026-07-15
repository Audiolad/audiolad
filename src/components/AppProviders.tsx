"use client";

import { GlobalAudioPlayerProvider } from "@/components/audio/GlobalAudioPlayerProvider";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GlobalAudioPlayerProvider>{children}</GlobalAudioPlayerProvider>;
}
