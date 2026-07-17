import type { ReactNode } from "react";

import CatalogMobileHeader from "@/components/listener/CatalogMobileHeader";

export default function CatalogListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <CatalogMobileHeader />

      <div className="listener-catalog-content px-5 lg:px-10 xl:flex-1 xl:overflow-y-auto xl:px-6 xl:pt-4 xl:pb-5">
        {children}
      </div>
    </>
  );
}
