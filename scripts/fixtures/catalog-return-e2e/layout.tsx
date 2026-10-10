import type { ReactNode } from "react";

import { GlobalAudioPlayerProvider } from "@/components/audio/GlobalAudioPlayerProvider";

export default function E2eLayout({ children }: { children: ReactNode }) {
  return <GlobalAudioPlayerProvider>{children}</GlobalAudioPlayerProvider>;
}
