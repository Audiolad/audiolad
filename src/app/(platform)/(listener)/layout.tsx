import { cookies } from "next/headers";

import { ListenerAppShell } from "@/components/listener/ListenerAppShell";
import { getListenerShellData } from "@/lib/listener/shell-data";
import { readListenerSidebarPinnedState } from "@/lib/navigation/listener-sidebar";

export default async function ListenerLayout({
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
      mode="default"
      initialSidebarPinned={initialSidebarPinned}
    >
      {children}
    </ListenerAppShell>
  );
}
