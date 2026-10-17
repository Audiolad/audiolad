"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import BusinessBottomNav from "@/components/business-app/BusinessBottomNav";
import BusinessSidebar from "@/components/business-app/BusinessSidebar";
import { isBusinessGuestPathname } from "@/lib/business-app/host";

export default function BusinessAppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";

  // a8240527: the guest coffee cabinet has its own chrome (no owner sidebar / bottom nav,
  // no account). Same Business app, layout and host — only the owner navigation is hidden.
  if (isBusinessGuestPathname(pathname)) {
    return <div className="business-app-guest">{children}</div>;
  }

  return (
    <div className="business-app-shell">
      <BusinessSidebar />
      <div className="business-app-main">{children}</div>
      <BusinessBottomNav />
    </div>
  );
}
