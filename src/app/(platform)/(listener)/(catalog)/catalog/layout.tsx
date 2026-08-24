import type { ReactNode } from "react";

import MobileCatalogSearch from "@/components/listener/MobileCatalogSearch";

export default function CatalogListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <div className="listener-catalog-mobile-search sticky top-0 z-30 min-h-[52px] bg-platform-surface px-5 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-3 xl:hidden">
        <MobileCatalogSearch />
      </div>

      <div className="listener-catalog-content px-5 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5">
        {children}
      </div>
    </>
  );
}
