import type { ReactNode } from "react";

import CatalogMobileFiltersSlot from "@/components/catalog/CatalogMobileFiltersSlot";
import MobileCatalogSearch from "@/components/listener/MobileCatalogSearch";
import MobileTopChrome from "@/components/listener/MobileTopChrome";

export default function CatalogListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <MobileTopChrome variant="catalog">
        <div className="flex items-start gap-2">
          <div className="min-h-[52px] min-w-0 flex-1">
            <MobileCatalogSearch />
          </div>
          <CatalogMobileFiltersSlot />
        </div>
      </MobileTopChrome>

      <div className="listener-catalog-content px-2.5 md:px-5 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5">
        {children}
      </div>
    </>
  );
}
