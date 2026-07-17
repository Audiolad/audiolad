import { ListenerAppShell } from "@/components/listener/ListenerAppShell";
import { getListenerShellData } from "@/lib/listener/shell-data";

export default async function ListenerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shellData = await getListenerShellData();

  return <ListenerAppShell shellData={shellData}>{children}</ListenerAppShell>;
}
