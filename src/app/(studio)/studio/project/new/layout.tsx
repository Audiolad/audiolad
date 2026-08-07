import type { ReactNode } from "react";

import { StudioAudioProvider } from "@/components/studio/StudioAudioProvider";

export default function NewStudioProjectLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#0b1019] text-[#edf0f7]">
      <StudioAudioProvider>{children}</StudioAudioProvider>
    </main>
  );
}
