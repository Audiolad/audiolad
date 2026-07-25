import AdminNav from "@/components/admin/AdminNav";
import AdminShell from "@/components/admin/AdminShell";
import { requireAdminPanelAccess } from "@/lib/admin/guard";
import { getVisibleAdminNavItems } from "@/lib/admin/nav";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdminPanelAccess();
  const navItems = getVisibleAdminNavItems(session.access).map((item) => ({
    href: item.href,
    label: item.label,
  }));

  return (
    <AdminShell title="Панель управления" subtitle="Системное управление платформой">
      <AdminNav items={navItems} />
      <div className="mt-6">{children}</div>
    </AdminShell>
  );
}
