"use client";

import type { ReactNode } from "react";

import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { resolveBusinessAccess } from "@/lib/business-app/access";

/** a8240527: renders its children for Business organization members only (UI; data stays server-gated). */
export default function BusinessMemberOnly({ children }: { children: ReactNode }) {
  return resolveBusinessAccess(useBusinessDomain()).level === "member" ? <>{children}</> : null;
}
