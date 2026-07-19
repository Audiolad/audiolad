import type { ReactNode } from "react";

import CatalogMobileHeader from "@/components/listener/CatalogMobileHeader";
import MobileCatalogSearch from "@/components/listener/MobileCatalogSearch";

export default function CatalogListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <CatalogMobileHeader />

      <div className="listener-catalog-mobile-search mt-5 min-h-[52px] px-5 xl:hidden">
        <MobileCatalogSearch />
      </div>

      <div className="listener-catalog-content px-5 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5">
        {children}
      </div>
    </>
  );
}
