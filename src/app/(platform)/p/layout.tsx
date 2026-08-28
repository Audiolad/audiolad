import { cookies } from "next/headers";

import { ListenerAppShell } from "@/components/listener/ListenerAppShell";
import { getListenerShellData } from "@/lib/listener/shell-data";
import { readListenerSidebarPinnedState } from "@/lib/navigation/listener-sidebar";

export default async function PublicPlaylistRouteLayout({
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
      <div className="px-5 pt-6 pb-4 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5">
        {children}
      </div>
    </ListenerAppShell>
  );
}
