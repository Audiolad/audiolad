"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { BusinessChromeAccess } from "@/lib/access-grants/access-line";
import { hasLiveBusinessAccess } from "@/lib/access-grants/access-line";
import type { GuestCoffeeLimitState } from "@/lib/business-app/guest-coffee/limit";

import BusinessAccessLine, { BusinessChromeAccessProvider, useBusinessChromeAccess } from "@/components/business-app/BusinessAccessLine";

import BusinessBrandLockup from "@/components/business-app/BusinessBrandLockup";
import BusinessBottomNav from "@/components/business-app/BusinessBottomNav";
import { BusinessCabinetPlayerProvider } from "@/components/business-app/workspace/BusinessCabinetPlayer";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { BusinessGuestStatusBar, BusinessGuestStatusProvider } from "@/components/business-app/BusinessGuestStatus";
import BusinessSidebar from "@/components/business-app/BusinessSidebar";
import { resolveBusinessAccess } from "@/lib/business-app/access";
import { normalizeBusinessAppPathname } from "@/lib/business-app/host";

/**
 * One AudioLad Business cabinet for everyone (a8240527, Sergey 17.10.2026): the guest from the
 * atlas (/guest/coffee) and the venue owner get the same sidebar (desktop), bottom nav
 * (mobile), sections and player. Only the access level differs: protected sections stay
 * visible but locked, and a guest sees the guest status strip.
 *
 * ba344b7f (Sergey 23.10.2026): «guest» here only means «no Business organization yet». A
 * signed-in visitor with a live 30-day gift or paid period is NOT a guest for the strip: the
 * gift offer and price are hidden and a quiet «Бесплатный доступ до …» line is shown instead.
 */
export default function BusinessAppShell({
  children,
  initialGuestLimit = null,
  customerAccess = null,
}: {
  children: ReactNode;
  /** Read-only gift / paid state from the layout; null for anonymous visitors. */
  customerAccess?: BusinessChromeAccess | null;
  /** Server listening-limit state for a guest (layout peek); null for members. */
  initialGuestLimit?: GuestCoffeeLimitState | null;
}) {
  return (
    <BusinessChromeAccessProvider value={customerAccess}>
      <BusinessGuestStatusProvider initialLimit={initialGuestLimit}>
        <BusinessShellFrame>{children}</BusinessShellFrame>
      </BusinessGuestStatusProvider>
    </BusinessChromeAccessProvider>
  );
}

/** Reads the chrome access from context, so a live period reported by /workspace applies at once. */
function BusinessShellFrame({ children }: { children: ReactNode }) {
  const access = resolveBusinessAccess(useBusinessDomain());
  const chromeAccess = useBusinessChromeAccess();
  const pathname = normalizeBusinessAppPathname(usePathname() ?? "");
  const workspace = pathname === "/workspace" || pathname.startsWith("/workspace/");
  const cabinetMusic = workspace || pathname === "/music" || pathname.startsWith("/music/");
  const liveAccess = hasLiveBusinessAccess(chromeAccess);
  const showGuestBar = access.level === "guest" && !cabinetMusic && !liveAccess;
  const showAccessLine = liveAccess && !cabinetMusic;

  return (
    <div className="business-app-shell" data-access={access.level}>
      <BusinessSidebar />
      <BusinessCabinetPlayerProvider>
        <div className="business-app-main">
          <header className="business-app-topbar">
            <BusinessBrandLockup testId="biz-brand-topbar" />
          </header>
          {showGuestBar ? <BusinessGuestStatusBar /> : null}
          {showAccessLine ? <BusinessAccessLine access={chromeAccess} /> : null}
          {children}
        </div>
        <BusinessBottomNav />
      </BusinessCabinetPlayerProvider>
    </div>
  );
}
