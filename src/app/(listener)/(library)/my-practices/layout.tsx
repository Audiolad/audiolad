import type { Metadata } from "next";
import type { ReactNode } from "react";

import LibraryMobileHeader from "@/components/listener/LibraryMobileHeader";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

export default function LibraryListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <LibraryMobileHeader />

      <div className="listener-library-content px-5 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5">
        {children}
      </div>
    </>
  );
}
