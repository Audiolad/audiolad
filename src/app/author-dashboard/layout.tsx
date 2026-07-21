import { ListenerAppShell } from "@/components/listener/ListenerAppShell";
import { getListenerShellData } from "@/lib/listener/shell-data";

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
