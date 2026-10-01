"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { BusinessOwnerHomeContext } from "@/lib/business-app/domain";

const BusinessDomainContext = createContext<BusinessOwnerHomeContext>({
  status: "anonymous",
});

export function BusinessDomainProvider({
  value,
  children,
}: {
  value: BusinessOwnerHomeContext;
  children: ReactNode;
}) {
  return (
    <BusinessDomainContext.Provider value={value}>
      {children}
    </BusinessDomainContext.Provider>
  );
}

export function useBusinessDomain(): BusinessOwnerHomeContext {
  return useContext(BusinessDomainContext);
}
