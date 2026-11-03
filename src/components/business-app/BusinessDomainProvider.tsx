"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { BusinessOwnerHomeContext } from "@/lib/business-app/domain";

const GuestStartContext = createContext(false);

/** AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED (253821e0): off = nothing captured or sent. */
const AttributionContext = createContext(false);

const BusinessHostnameContext = createContext("");

const BusinessDomainContext = createContext<BusinessOwnerHomeContext>({
  status: "anonymous",
});

export function BusinessDomainProvider({
  value,
  hostname = "",
  guestStartEnabled = false,
  attributionEnabled = false,
  children,
}: {
  value: BusinessOwnerHomeContext;
  hostname?: string;
  guestStartEnabled?: boolean;
  attributionEnabled?: boolean;
  children: ReactNode;
}) {
  return (
    <BusinessHostnameContext.Provider value={hostname}>
      <BusinessDomainContext.Provider value={value}>
        <GuestStartContext.Provider value={guestStartEnabled}>
          <AttributionContext.Provider value={attributionEnabled}>{children}</AttributionContext.Provider>
        </GuestStartContext.Provider>
      </BusinessDomainContext.Provider>
    </BusinessHostnameContext.Provider>
  );
}

export function useBusinessDomain(): BusinessOwnerHomeContext {
  return useContext(BusinessDomainContext);
}

export function useBusinessHostname(): string {
  return useContext(BusinessHostnameContext);
}

export function useGuestStartEnabled(): boolean {
  return useContext(GuestStartContext);
}

export function useAttributionEnabled(): boolean {
  return useContext(AttributionContext);
}
