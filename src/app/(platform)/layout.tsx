import { headers } from "next/headers";
import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { CoffeeAuthProvider } from "@/components/auth/AuthHostNavigation";
import type { ReactNode } from "react";

import PlatformProviders from "@/components/providers/PlatformProviders";

export default async function PlatformRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Coffee only exposes platform auth here. Do not restore a listener player or PWA
  // chrome, which calls platform-only APIs and links to unavailable listener pages.
  if (isCoffeeHostRequest(await headers())) {
    return <CoffeeAuthProvider>{children}</CoffeeAuthProvider>;
  }
  return <PlatformProviders>{children}</PlatformProviders>;
}
