import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import LibraryMobileHeader from "@/components/listener/LibraryMobileHeader";
import MyPracticesLibraryChrome from "@/components/my-practices/MyPracticesLibraryChrome";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

function LibraryChromeFallback() {
  return (
    <div className="xl:hidden">
      <LibraryMobileHeader />
    </div>
  );
}

export default function LibraryListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <Suspense fallback={<LibraryChromeFallback />}>
        <MyPracticesLibraryChrome />
      </Suspense>

      <div className="listener-library-content px-5 lg:px-10 xl:px-6 xl:pb-5">
        {children}
      </div>
    </>
  );
}
