import type { Metadata } from "next";

import { ListenerAppShell } from "@/components/listener/ListenerAppShell";
import { getListenerShellData } from "@/lib/listener/shell-data";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

export default async function AuthorDashboardRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shellData = await getListenerShellData();

  return (
    <ListenerAppShell shellData={shellData} mode="author">
      {children}
    </ListenerAppShell>
  );
}
