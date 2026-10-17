"use client";

import type { ReactNode } from "react";

import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { resolveBusinessAccess } from "@/lib/business-app/access";

/**
 * a8240527: renders its children for Business organization members only, `guest` otherwise
 * (UI only; data stays server-gated).
 */
export default function BusinessMemberOnly({ children, guest = null }: { children?: ReactNode; guest?: ReactNode }) {
  return <>{resolveBusinessAccess(useBusinessDomain()).level === "member" ? children : guest}</>;
}
