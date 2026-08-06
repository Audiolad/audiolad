import type { ReactNode } from "react";

import PlatformProviders from "@/components/providers/PlatformProviders";

export default function PlatformRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PlatformProviders>{children}</PlatformProviders>;
}
