"use client";

import type { ReactNode } from "react";

import BusinessBottomNav from "@/components/business-app/BusinessBottomNav";
import BusinessSidebar from "@/components/business-app/BusinessSidebar";

export default function BusinessAppShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="business-app-shell">
      <BusinessSidebar />
      <div className="business-app-main">{children}</div>
      <BusinessBottomNav />
    </div>
  );
}
