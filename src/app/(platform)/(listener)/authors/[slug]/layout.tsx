import type { ReactNode } from "react";

import LivePublicRouteSync from "@/components/public-content/LivePublicRouteSync";

export default function AuthorPublicLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <LivePublicRouteSync />
      {children}
    </>
  );
}
