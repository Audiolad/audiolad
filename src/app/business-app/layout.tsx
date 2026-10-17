import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import BusinessAppShell from "@/components/business-app/BusinessAppShell";
import { BusinessDomainProvider } from "@/components/business-app/BusinessDomainProvider";
import "@/components/business-app/theme/business-theme.css";
import "@/components/business-app/business-app.css";
import { resolveBusinessAccess } from "@/lib/business-app/access";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { guestCoffeeLimitState } from "@/lib/business-app/guest-coffee/limit";
import { peekGuestCoffeeUsage } from "@/lib/business-app/guest-coffee/usage.server";
import {
  getHostnameFromHeaders,
  isBusinessHostname,
} from "@/lib/business-app/host";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";
import { BUSINESS_THEMES, resolveBusinessTheme } from "@/lib/business-app/theme";

export const metadata: Metadata = buildBusinessAppMetadata();

// One theme for every Business screen (21546de4); see src/lib/business-app/theme.ts.
const theme = resolveBusinessTheme();

export const viewport: Viewport = {
  themeColor: BUSINESS_THEMES[theme].themeColor,
};

export default async function BusinessAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const hostname = getHostnameFromHeaders(await headers());

  // Defense in depth: proxy already 404s /business-app on non-business hosts.
  if (!isBusinessHostname(hostname)) {
    notFound();
  }

  const domain = await loadBusinessOwnerHomeContext();
  // a8240527: the guest strip shows the server listening limit on every screen (read-only peek).
  const initialGuestLimit =
    resolveBusinessAccess(domain).level === "guest"
      ? guestCoffeeLimitState(await peekGuestCoffeeUsage())
      : null;

  return (
    <div className="business-app-root" data-biz-theme={theme}>
      <BusinessDomainProvider value={domain}>
        <BusinessAppShell initialGuestLimit={initialGuestLimit}>{children}</BusinessAppShell>
      </BusinessDomainProvider>
    </div>
  );
}
