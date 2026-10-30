import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import BusinessAppShell from "@/components/business-app/BusinessAppShell";
import { BusinessDomainProvider } from "@/components/business-app/BusinessDomainProvider";
import "@/components/business-app/theme/business-theme.css";
import "@/components/business-app/business-app.css";
import { hasLiveBusinessAccess } from "@/lib/access-grants/access-line";
import { peekBusinessChromeAccess } from "@/lib/access-grants/peek.server";
import { resolveBusinessAccess } from "@/lib/business-app/access";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { businessPointSessionAlive } from "@/lib/business-app/point-session.server";
import { BUSINESS_ENTRY_COOKIE, parseBusinessEntry } from "@/lib/business-app/live-refresh";
import { guestCoffeeLimitState } from "@/lib/business-app/guest-coffee/limit";
import { peekGuestCoffeeUsage } from "@/lib/business-app/guest-coffee/usage.server";
import {
  getHostnameFromHeaders,
  isBusinessHostname,
} from "@/lib/business-app/host";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";
import { BUSINESS_THEMES, resolveBusinessTheme } from "@/lib/business-app/theme";

export async function generateMetadata(): Promise<Metadata> {
  return buildBusinessAppMetadata(getHostnameFromHeaders(await headers()));
}

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
  const pointReports = await businessPointSessionAlive();
  // ba344b7f: live gift / paid state (read-only) – such a visitor never sees the guest strip.
  const customerAccess = domain.status === "authenticated" ? await peekBusinessChromeAccess() : null;
  // a8240527: the guest strip shows the server listening limit on every screen (read-only peek).
  const initialGuestLimit =
    !pointReports && resolveBusinessAccess(domain).level === "guest" && !hasLiveBusinessAccess(customerAccess)
      ? guestCoffeeLimitState(await peekGuestCoffeeUsage())
      : null;

  // Header switcher side (UI only) so a reload opens the same side without a flash.
  const initialEntry = parseBusinessEntry((await cookies()).get(BUSINESS_ENTRY_COOKIE)?.value);

  return (
    <div className="business-app-root" data-biz-theme={theme}>
      <BusinessDomainProvider value={domain}>
        <BusinessAppShell initialGuestLimit={initialGuestLimit} customerAccess={customerAccess} pointReports={pointReports} initialEntry={initialEntry}>{children}</BusinessAppShell>
      </BusinessDomainProvider>
    </div>
  );
}
