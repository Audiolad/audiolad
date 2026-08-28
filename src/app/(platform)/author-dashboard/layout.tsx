import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ListenerAppShell } from "@/components/listener/ListenerAppShell";
import { getListenerShellData } from "@/lib/listener/shell-data";
import { readListenerSidebarPinnedState } from "@/lib/navigation/listener-sidebar";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

export default async function AuthorDashboardRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [shellData, cookieStore] = await Promise.all([
    getListenerShellData(),
    cookies(),
  ]);
  const initialSidebarPinned = readListenerSidebarPinnedState(cookieStore);

  return (
    <ListenerAppShell
      shellData={shellData}
      mode="author"
      initialSidebarPinned={initialSidebarPinned}
    >
      {children}
    </ListenerAppShell>
  );
}
