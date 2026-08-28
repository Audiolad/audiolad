import type { ReactNode } from "react";

import { AuthorSupportBannerGate } from "@/components/author-support/AuthorSupportBannerGate";

export default function StudioRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthorSupportBannerGate variant="dark">{children}</AuthorSupportBannerGate>
  );
}
