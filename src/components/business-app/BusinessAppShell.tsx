"use client";

import type { ReactNode } from "react";

import type { GuestCoffeeLimitState } from "@/lib/business-app/guest-coffee/limit";

import BusinessBottomNav from "@/components/business-app/BusinessBottomNav";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { BusinessGuestStatusBar, BusinessGuestStatusProvider } from "@/components/business-app/BusinessGuestStatus";
import BusinessSidebar from "@/components/business-app/BusinessSidebar";
import { resolveBusinessAccess } from "@/lib/business-app/access";

/**
 * One AudioLad Business cabinet for everyone (a8240527, Sergey 17.10.2026): the guest from the
 * atlas (/guest/coffee) and the venue owner get the same sidebar (desktop), bottom nav
 * (mobile), sections and player. Only the access level differs: protected sections stay
 * visible but locked, and a guest sees the guest status strip.
 */
export default function BusinessAppShell({
  children,
  initialGuestLimit = null,
}: {
  children: ReactNode;
  /** Server listening-limit state for a guest (layout peek); null for members. */
  initialGuestLimit?: GuestCoffeeLimitState | null;
}) {
  const access = resolveBusinessAccess(useBusinessDomain());

  return (
    <BusinessGuestStatusProvider initialLimit={initialGuestLimit}>
      <div className="business-app-shell" data-access={access.level}>
        <BusinessSidebar />
        <div className="business-app-main">
          {access.level === "guest" ? <BusinessGuestStatusBar /> : null}
          {children}
        </div>
        <BusinessBottomNav />
      </div>
    </BusinessGuestStatusProvider>
  );
}
