"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { BusinessChromeAccess } from "@/lib/access-grants/access-line";
import { hasLiveBusinessAccess } from "@/lib/access-grants/access-line";
import type { GuestCoffeeLimitState } from "@/lib/business-app/guest-coffee/limit";

import BusinessAccessLine, { BusinessChromeAccessProvider, useBusinessChromeAccess } from "@/components/business-app/BusinessAccessLine";

import BusinessAudienceTracker from "./BusinessAudienceTracker";

import BusinessBrandLockup from "@/components/business-app/BusinessBrandLockup";
import BusinessEntrySwitcher from "@/components/business-app/BusinessEntrySwitcher";
import BusinessLiveRefresh from "@/components/business-app/BusinessLiveRefresh";
import BusinessCabinetModeBanner from "@/components/business-app/BusinessCabinetModeBanner";
import {
  BusinessCabinetModeProvider,
  BusinessEntryProvider,
  useBusinessCabinetMode,
  type BusinessCabinetServerMode,
} from "@/components/business-app/BusinessPointMode";
import BusinessBottomNav from "@/components/business-app/BusinessBottomNav";
import { BusinessCabinetPlayerProvider } from "@/components/business-app/workspace/BusinessCabinetPlayer";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { BusinessGuestStatusBar, BusinessGuestStatusProvider } from "@/components/business-app/BusinessGuestStatus";
import { BusinessGuestPlaybackProvider } from "@/components/business-app/sound/BusinessGuestPlayback";
import BusinessSidebar from "@/components/business-app/BusinessSidebar";
import { resolveBusinessAccess } from "@/lib/business-app/access";
import { normalizeBusinessAppPathname } from "@/lib/business-app/host";
import type { BusinessEntry } from "@/lib/business-app/live-refresh";

/**
 * One AudioLad Business cabinet for everyone (a8240527, Sergey 17.10.2026): the guest from the
 * atlas (/guest/coffee) and the venue owner get the same sidebar (desktop), bottom nav
 * (mobile), sections and player. Only the access level differs: protected sections stay
 * visible but locked, and a guest sees the guest status strip.
 *
 * ba344b7f (Sergey 23.10.2026): «guest» here only means «no Business organization yet». A
 * signed-in visitor with a live gift or paid period is NOT a guest for the strip: the
 * gift offer and price are hidden and a quiet «Бесплатный доступ до …» line is shown instead.
 */
export default function BusinessAppShell({
  children,
  initialGuestLimit = null,
  customerAccess = null,
  pointReports = false,
  initialEntry = "person",
  cabinetMode,
}: {
  children: ReactNode;
  /** Read-only gift / paid state from the layout; null for anonymous visitors. */
  customerAccess?: BusinessChromeAccess | null;
  /** Server listening-limit state for a guest (layout peek); null for members. */
  initialGuestLimit?: GuestCoffeeLimitState | null;
  /** This browser is the paired venue device and may report now playing. */
  pointReports?: boolean;
  /** Header switcher side saved in the UI cookie (person or venue). */
  initialEntry?: BusinessEntry;
  /** owner | preview | point and the hall device facts (layout, cabinet-mode.server.ts). */
  cabinetMode?: BusinessCabinetServerMode;
}) {
  const modeValue: BusinessCabinetServerMode = cabinetMode ?? {
    mode: pointReports ? "point" : "owner",
    pointReports,
    pointCanEdit: false,
    pointVenueName: null,
    ownerUnlockUntil: null,
    canPreview: false,
  };
  return (
    <BusinessChromeAccessProvider value={customerAccess}>
      <BusinessGuestStatusProvider initialLimit={initialGuestLimit}>
        <BusinessCabinetModeProvider value={modeValue}>
          <BusinessEntryProvider initialEntry={initialEntry}>
            <BusinessShellFrame pointReports={pointReports} initialGuestLimit={initialGuestLimit}>{children}</BusinessShellFrame>
          </BusinessEntryProvider>
        </BusinessCabinetModeProvider>
      </BusinessGuestStatusProvider>
    </BusinessChromeAccessProvider>
  );
}

/** Reads the chrome access from context, so a live period reported by /workspace applies at once. */
function BusinessShellFrame({ children, pointReports, initialGuestLimit }: { children: ReactNode; pointReports: boolean; initialGuestLimit: GuestCoffeeLimitState | null }) {
  const access = resolveBusinessAccess(useBusinessDomain(), pointReports);
  const signedIn = useBusinessDomain().status === "authenticated";
  const chromeAccess = useBusinessChromeAccess();
  const pathname = normalizeBusinessAppPathname(usePathname() ?? "");
  const workspace = pathname === "/workspace" || pathname.startsWith("/workspace/");
  const cabinetMusic = workspace || pathname === "/music" || pathname.startsWith("/music/");
  const liveAccess = hasLiveBusinessAccess(chromeAccess);
  // The period line and the guest offer are the owner's (cabinet-mode.ts «accessLine»), not the hall's.
  const cabinet = useBusinessCabinetMode();
  const showGuestBar = access.level === "guest" && !access.pointDevice && !cabinetMusic && !liveAccess && cabinet.can("accessLine");
  const showAccessLine = liveAccess && !cabinetMusic && cabinet.can("accessLine");

  return (
    <div className="business-app-shell" data-access={access.level}>
      <BusinessAudienceTracker pointDevice={pointReports} />
      <BusinessLiveRefresh enabled={signedIn || pointReports} />
      <BusinessSidebar />
      <BusinessCabinetPlayerProvider pointReports={pointReports}>
        <BusinessGuestPlaybackProvider initialLimit={initialGuestLimit ?? "ok"}>
        <div className="business-app-main">
          <header className="business-app-topbar">
            <BusinessBrandLockup testId="biz-brand-topbar" />
            <BusinessEntrySwitcher />
          </header>
          <BusinessCabinetModeBanner />
          {showGuestBar ? <BusinessGuestStatusBar /> : null}
          {showAccessLine ? <BusinessAccessLine access={chromeAccess} /> : null}
          {children}
        </div>
        <BusinessBottomNav />
        </BusinessGuestPlaybackProvider>
      </BusinessCabinetPlayerProvider>
    </div>
  );
}
