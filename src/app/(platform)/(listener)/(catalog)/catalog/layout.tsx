import type { ReactNode } from "react";

import CatalogMobileFiltersSlot from "@/components/catalog/CatalogMobileFiltersSlot";
import MobileCatalogSearch from "@/components/listener/MobileCatalogSearch";

export default function CatalogListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <div className="listener-catalog-mobile-search fixed top-0 inset-x-0 z-30 bg-platform-surface px-5 pt-[max(0.25rem,env(safe-area-inset-top,0px))] pb-0 xl:hidden">
        <div className="flex items-start gap-2">
          <div className="min-h-[52px] min-w-0 flex-1">
            <MobileCatalogSearch />
          </div>
          <div className="lg:hidden">
            <CatalogMobileFiltersSlot />
          </div>
        </div>
      </div>
      <div
        className="listener-catalog-mobile-search-spacer xl:hidden"
        aria-hidden="true"
      />

      <div className="listener-catalog-content px-5 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden">
        {children}
      </div>
    </>
  );
}
