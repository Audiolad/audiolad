import type { Metadata } from "next";

import AdminNav from "@/components/admin/AdminNav";
import AdminShell from "@/components/admin/AdminShell";
import { requireAdminPanelAccess } from "@/lib/admin/guard";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

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
