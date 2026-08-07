import type { ReactNode } from "react";

import { StudioAudioProvider } from "@/components/studio/StudioAudioProvider";

export default function NewStudioProjectLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-platform-surface text-[#25135c]">
      <StudioAudioProvider>{children}</StudioAudioProvider>
    </main>
  );
}
