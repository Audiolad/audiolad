import { ListenerAppShell } from "@/components/listener/ListenerAppShell";
import { getListenerShellData } from "@/lib/listener/shell-data";

export default async function PublicPlaylistRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shellData = await getListenerShellData();

  return (
    <ListenerAppShell shellData={shellData} mode="default">
      <div className="px-5 pt-6 pb-4 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5">
        {children}
      </div>
    </ListenerAppShell>
  );
}
