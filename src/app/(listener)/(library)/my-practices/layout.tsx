import type { ReactNode } from "react";

import LibraryMobileHeader from "@/components/listener/LibraryMobileHeader";

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
