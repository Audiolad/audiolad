import { businessGuestStartConfig } from "@/lib/business-guest/start-config";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import BusinessAppShell from "@/components/business-app/BusinessAppShell";
import BusinessAttributionCapture from "@/components/business-app/BusinessAttributionCapture";
import { businessTrialAttributionConfig } from "@/lib/business-trial-attribution/config";
import { BusinessDomainProvider } from "@/components/business-app/BusinessDomainProvider";
import "@/components/business-app/theme/business-theme.css";
import "@/components/business-app/business-app.css";
import { hasLiveBusinessAccess } from "@/lib/access-grants/access-line";
import { peekBusinessChromeAccess } from "@/lib/access-grants/peek.server";
import { resolveBusinessAccess } from "@/lib/business-app/access";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { businessPointReports } from "@/lib/business-app/cabinet-mode";
import { loadBusinessCabinetMode } from "@/lib/business-app/cabinet-mode.server";
import { loadLocationSoundSettings } from "@/lib/business-app/location-sound-settings.server";
import { BUSINESS_VIEW_COOKIE, parseBusinessEntry } from "@/lib/business-app/live-refresh";
import { loadPointDeviceAccess, loadPointDeviceVenue } from "@/lib/business-app/point-device.server";
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
  // owner | preview | point from one table (cabinet-mode.ts): the hall device is the venue side
  // until the owner re-enters the password on it; the owner's preview never reports as a point.
  const cabinet = await loadBusinessCabinetMode();
  const pointReports = businessPointReports(cabinet);
  const pointVenue = cabinet.pointAlive ? await loadPointDeviceVenue() : null;
  // ba344b7f: live gift / paid state (read-only) – such a visitor never sees the guest strip.
  // The hall device shows the venue's period, not the account that may be signed in on it.
  const customerAccess =
    cabinet.mode === "point"
      ? pointVenue
        ? await loadPointDeviceAccess(pointVenue)
        : null
      : domain.status === "authenticated"
        ? await peekBusinessChromeAccess()
        : null;
  // Preview «как видит точка» follows the owner's own «Разрешить менять настройку на точке» switch.
  const previewSound =
    cabinet.mode === "preview" && domain.status === "authenticated" && domain.location
      ? await loadLocationSoundSettings(domain.location.id)
      : null;
  const cabinetMode = {
    mode: cabinet.mode,
    pointReports,
    pointCanEdit: cabinet.mode === "preview" ? previewSound?.pointCanEditSettings !== false : pointVenue?.pointCanEdit ?? false,
    pointVenueName: pointVenue?.locationName ?? null,
    ownerUnlockUntil: cabinet.ownerUnlockUntil,
    staleOwnerSession: cabinet.staleOwnerSession,
    canPreview: domain.status === "authenticated",
  };
  // a8240527: the guest strip shows the server listening limit on every screen (read-only peek).
  const initialGuestLimit =
    !pointReports && resolveBusinessAccess(domain).level === "guest" && !hasLiveBusinessAccess(customerAccess)
      ? guestCoffeeLimitState(await peekGuestCoffeeUsage())
      : null;

  // Header switcher side (owner or preview «как видит точка») so a reload opens the same side without a flash.
  const initialEntry = parseBusinessEntry((await cookies()).get(BUSINESS_VIEW_COOKIE)?.value);

  const attributionEnabled = businessTrialAttributionConfig(process.env).enabled;

  return (
    <div className="business-app-root" data-biz-theme={theme}>
      <BusinessDomainProvider value={domain} hostname={hostname} guestStartEnabled={businessGuestStartConfig(process.env).available} attributionEnabled={attributionEnabled}>
        {attributionEnabled ? <BusinessAttributionCapture /> : null}
        <BusinessAppShell initialGuestLimit={initialGuestLimit} customerAccess={customerAccess} pointReports={pointReports} initialEntry={initialEntry} cabinetMode={cabinetMode}>{children}</BusinessAppShell>
      </BusinessDomainProvider>
    </div>
  );
}
