import AdminNav from "@/components/admin/AdminNav";
import AdminShell from "@/components/admin/AdminShell";
import { getCachedAdminCommercialApplicationAttentionSummary } from "@/lib/admin/commercial-application-attention-cache";
import { requireAdminPanelAccess } from "@/lib/admin/guard";
import { getVisibleAdminNavItems } from "@/lib/admin/nav";
import { snapshotHasPermission } from "@/lib/auth/platform-access";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdminPanelAccess();
  const canViewAuthors = snapshotHasPermission(session.access, "authors.view");

  let commercialNewCount = 0;

  if (canViewAuthors) {
    try {
      const attention =
        await getCachedAdminCommercialApplicationAttentionSummary();
      commercialNewCount = attention.newCount;
    } catch (error) {
      console.error("admin_layout_commercial_attention_error", error);
    }
  }

  const navItems = getVisibleAdminNavItems(session.access).map((item) => ({
    href: item.href,
    label: item.label,
    badgeCount:
      item.href === "/admin/commercial-applications"
        ? commercialNewCount
        : undefined,
  }));

  return (
    <AdminShell title="Панель управления" subtitle="Системное управление платформой">
      <AdminNav items={navItems} />
      <div className="mt-6">{children}</div>
    </AdminShell>
  );
}
