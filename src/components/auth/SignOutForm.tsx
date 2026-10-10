"use client";

import type { ReactNode } from "react";

import { clearCatalogReturnSnapshot } from "@/lib/catalog/return-state";

/** Sign-out form that also erases the catalog return snapshot of this tab. */
export default function SignOutForm({
  action,
  children,
}: {
  action: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={() => {
        try {
          clearCatalogReturnSnapshot(window.sessionStorage);
        } catch {
          // ignore
        }
      }}
    >
      {children}
    </form>
  );
}
