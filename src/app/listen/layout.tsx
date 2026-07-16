import type { Metadata, Viewport } from "next";

import { PLATFORM_PLAYER_THEME_COLOR } from "@/lib/navigation/bottom-nav";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: PLATFORM_PLAYER_THEME_COLOR,
};

export default function ListenLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="player-shell min-h-dvh bg-[#24133f]">{children}</div>;
}
