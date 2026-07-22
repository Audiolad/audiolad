import type { Metadata } from "next";
import type { ReactNode } from "react";

import { HistoryPageHeader } from "@/components/history/HistorySections";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

export default function HistoryListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <HistoryPageHeader />

      <div className="listener-history-content px-5 pt-5 lg:px-10 xl:max-w-[880px] xl:px-8 xl:pt-3 xl:pb-5">
        {children}
      </div>
    </>
  );
}
