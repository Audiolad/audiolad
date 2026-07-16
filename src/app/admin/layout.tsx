import AdminNav from "@/components/admin/AdminNav";
import AdminShell from "@/components/admin/AdminShell";
import { requireAdminPanelAccess } from "@/lib/admin/guard";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminPanelAccess();

  return (
    <AdminShell title="Панель управления" subtitle="Системное управление платформой">
      <AdminNav />
      <div className="mt-6">{children}</div>
    </AdminShell>
  );
}
