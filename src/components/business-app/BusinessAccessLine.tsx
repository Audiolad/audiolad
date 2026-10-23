"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useBusinessGuestStatus } from "@/components/business-app/BusinessGuestStatus";
import {
  BUSINESS_NO_ACCESS,
  businessAccessLine,
  hasLiveBusinessAccess,
  type BusinessChromeAccess,
} from "@/lib/access-grants/access-line";

const ChromeAccessContext = createContext<BusinessChromeAccess>(BUSINESS_NO_ACCESS);

/** Live gift / paid state for every cabinet screen (hides repeated gift offers and prices). */
export function BusinessChromeAccessProvider({ value, children }: { value: BusinessChromeAccess | null; children: ReactNode }) {
  return <ChromeAccessContext.Provider value={value ?? BUSINESS_NO_ACCESS}>{children}</ChromeAccessContext.Provider>;
}

export function useBusinessChromeAccess(): BusinessChromeAccess {
  return useContext(ChromeAccessContext);
}

/** True while the 30-day gift or a paid period is live: do not offer the gift or show its price. */
export function useHasLiveBusinessAccess(): boolean {
  return hasLiveBusinessAccess(useContext(ChromeAccessContext));
}

/**
 * Quiet line instead of the guest strip once the 30-day gift (or a paid period) is live
 * (Sergey 23.10.2026): no «Гостевой режим», no repeated gift offer, no price.
 * The locked-section notice still has a place to be announced.
 */
export default function BusinessAccessLine({ access }: { access: BusinessChromeAccess }) {
  const { notice } = useBusinessGuestStatus();
  const line = businessAccessLine(access);
  if (!line) return null;
  return (
    <section className="business-app-access-line" aria-label="Доступ к кабинету" data-testid="biz-access-line" data-mode={access.mode}>
      <p className="business-app-muted">{line}</p>
      <p className="business-app-guest-bar__notice" role="status" data-testid="biz-locked-notice">
        {notice ?? ""}
      </p>
    </section>
  );
}
