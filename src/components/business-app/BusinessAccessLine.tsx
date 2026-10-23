"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { useBusinessGuestStatus } from "@/components/business-app/BusinessGuestStatus";
import {
  BUSINESS_NO_ACCESS,
  businessAccessLine,
  effectiveChromeAccess,
  hasLiveBusinessAccess,
  type BusinessChromeAccess,
} from "@/lib/access-grants/access-line";
import { BUSINESS_CONNECT_HREF } from "@/lib/business-app/access";

type ChromeAccessState = { access: BusinessChromeAccess; report: (access: BusinessChromeAccess) => void };

const ChromeAccessContext = createContext<ChromeAccessState>({ access: BUSINESS_NO_ACCESS, report: () => {} });

/** Live gift / paid state for every cabinet screen (hides repeated gift offers and prices). */
export function BusinessChromeAccessProvider({ value, children }: { value: BusinessChromeAccess | null; children: ReactNode }) {
  const [reported, setReported] = useState<BusinessChromeAccess | null>(null);
  const report = useCallback((next: BusinessChromeAccess) => {
    if (!hasLiveBusinessAccess(next)) return;
    setReported((prev) => (prev && prev.mode === next.mode && prev.endsAt === next.endsAt ? prev : next));
  }, []);
  // Signed out (the layout sends null): forget a period reported for the previous session.
  if (value == null && reported !== null) setReported(null);
  const access = effectiveChromeAccess(value, reported);
  const state = useMemo(() => ({ access, report }), [access, report]);
  return <ChromeAccessContext.Provider value={state}>{children}</ChromeAccessContext.Provider>;
}

export function useBusinessChromeAccess(): BusinessChromeAccess {
  return useContext(ChromeAccessContext).access;
}

/**
 * The workspace resolves (and on the first visit issues) the gift on the server; it reports the
 * live period here so the shared shell drops the guest strip on the next client navigation
 * without a reload (the layout peek of that same request may have run before the gift existed).
 */
export function useReportBusinessChromeAccess(): (access: BusinessChromeAccess) => void {
  return useContext(ChromeAccessContext).report;
}

/** True while the 30-day gift or a paid period is live: do not offer the gift or show its price. */
export function useHasLiveBusinessAccess(): boolean {
  return hasLiveBusinessAccess(useContext(ChromeAccessContext).access);
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
        {notice ? (
          <>
            {" "}
            <Link href={BUSINESS_CONNECT_HREF} className="underline" data-testid="biz-locked-connect">
              Подключить точку
            </Link>
          </>
        ) : null}
      </p>
    </section>
  );
}
