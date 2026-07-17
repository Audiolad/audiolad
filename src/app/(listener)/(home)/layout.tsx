import type { ReactNode } from "react";

import LegalFooter from "@/components/LegalFooter";
import HomeMobileHeader from "@/components/listener/HomeMobileHeader";
import { getListenerShellData } from "@/lib/listener/shell-data";

export default async function HomeListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const shellData = await getListenerShellData();

  return (
    <>
      <HomeMobileHeader shellData={shellData} />

      <div className="listener-home-content px-5 lg:px-10 xl:px-6 xl:pt-4 xl:pb-5">
        {children}
      </div>

      <div className="px-5 pb-6 lg:px-10 xl:hidden">
        <LegalFooter className="mt-6" />
      </div>
    </>
  );
}
