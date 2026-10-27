"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { BUSINESS_GIFT_CTA } from "@/lib/access-grants/copy";
import { BUSINESS_TRIAL_SIGN_UP_HREF } from "@/lib/access-grants/paths";
import { BUSINESS_CONNECT_HREF, businessLockedNotice } from "@/lib/business-app/access";
import { GUEST_COFFEE_COPY, GUEST_COFFEE_TERMS } from "@/lib/business-app/guest-coffee/copy";
import type { GuestCoffeeLimitState } from "@/lib/business-app/guest-coffee/limit";

/**
 * a8240527 – guest status inside the shared Business shell: the server-side listening limit
 * (reported by the Music section) and the «доступно после подключения» notice of locked
 * sections. Display only; the limit itself is enforced by the server.
 */
type GuestStatus = {
  /** null until a section that plays music reports the server state. */
  limit: GuestCoffeeLimitState | null;
  setLimit: (limit: GuestCoffeeLimitState) => void;
  notice: string | null;
  showLocked: (title: string) => void;
};

const noop = () => {};
const GuestStatusContext = createContext<GuestStatus>({ limit: null, setLimit: noop, notice: null, showLocked: noop });

export function BusinessGuestStatusProvider({
  children,
  initialLimit = null,
}: {
  children: ReactNode;
  initialLimit?: GuestCoffeeLimitState | null;
}) {
  const [limit, setLimitState] = useState<GuestCoffeeLimitState | null>(initialLimit);
  // The notice belongs to the screen where the locked item was tapped; it is dropped on navigation.
  const pathname = usePathname();
  const [lockedTap, setLockedTap] = useState<{ text: string; pathname: string | null } | null>(null);
  const notice = lockedTap && lockedTap.pathname === pathname ? lockedTap.text : null;
  const setLimit = useCallback((value: GuestCoffeeLimitState) => setLimitState(value), []);
  const showLocked = useCallback(
    (title: string) => setLockedTap({ text: businessLockedNotice(title), pathname }),
    [pathname],
  );
  const value = useMemo(() => ({ limit, setLimit, notice, showLocked }), [limit, setLimit, notice, showLocked]);
  return <GuestStatusContext.Provider value={value}>{children}</GuestStatusContext.Provider>;
}

export function useBusinessGuestStatus(): GuestStatus {
  return useContext(GuestStatusContext);
}

/**
 * Strip at the top of every cabinet screen for a guest.
 * Before the meter runs out it offers only the 30-day gift. The 30 minutes are
 * named only in the exhausted banner, after the server limit is reached.
 */
export function BusinessGuestStatusBar() {
  const { limit, notice } = useBusinessGuestStatus();
  const exhausted = limit === "exhausted";
  return (
    <section
      className="business-app-guest-bar"
      aria-label={exhausted ? "Гостевое время закончилось" : "30 дней в подарок"}
      data-testid="biz-guest-status"
      data-limit={limit ?? "unknown"}
    >
      <div className="business-app-guest-bar__text">
        {exhausted ? (
          <p data-testid="biz-guest-exhausted">{GUEST_COFFEE_COPY.exhaustedBanner}</p>
        ) : (
          <p className="business-app-guest-bar__terms" data-testid="biz-guest-terms">{GUEST_COFFEE_TERMS}.</p>
        )}
      </div>
      {/* Present only after a locked section is tapped, so an empty line does not open a gap. */}
      {notice ? (
        <p className="business-app-guest-bar__notice" role="status" data-testid="biz-locked-notice">
          {notice}
        </p>
      ) : null}
      <div className="business-app-guest-bar__actions">
        {exhausted ? (
          <a
            href={BUSINESS_TRIAL_SIGN_UP_HREF}
            className="business-app-btn business-app-btn-primary business-app-focus-ring"
            data-testid="biz-guest-register"
          >
            {GUEST_COFFEE_COPY.exhaustedRegister}
          </a>
        ) : (
          <a
            href={BUSINESS_TRIAL_SIGN_UP_HREF}
            className="business-app-btn business-app-btn-primary business-app-focus-ring"
            data-testid="biz-trial-cta"
          >
            {BUSINESS_GIFT_CTA}
          </a>
        )}
        <Link
          href={BUSINESS_CONNECT_HREF}
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          data-testid="biz-connect"
        >
          Подключить
        </Link>
      </div>
    </section>
  );
}
