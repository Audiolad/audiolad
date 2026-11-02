"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { BusinessOwnerHomeContext } from "@/lib/business-app/domain";

const BusinessHostnameContext = createContext("");

const BusinessDomainContext = createContext<BusinessOwnerHomeContext>({
  status: "anonymous",
});

export function BusinessDomainProvider({
  value,
  hostname = "",
  children,
}: {
  value: BusinessOwnerHomeContext;
  hostname?: string;
  children: ReactNode;
}) {
  return (
    <BusinessHostnameContext.Provider value={hostname}>
      <BusinessDomainContext.Provider value={value}>
        {children}
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
