import AdminNav from "@/components/admin/AdminNav";
import AdminShell from "@/components/admin/AdminShell";
import { getCachedAdminAuthorApplicationAttentionSummary } from "@/lib/admin/author-application-attention-cache";
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
  let authorApplicationAttentionCount = 0;

  if (canViewAuthors) {
    try {
      const [attention, authorApplicationAttention] = await Promise.all([
        getCachedAdminCommercialApplicationAttentionSummary(),
        getCachedAdminAuthorApplicationAttentionSummary(),
      ]);
      commercialNewCount = attention.newCount;
      authorApplicationAttentionCount = authorApplicationAttention.attentionCount;
    } catch (error) {
      console.error("admin_layout_author_attention_error", error);
    }
  }

  const navItems = getVisibleAdminNavItems(session.access).map((item) => ({
    href: item.href,
    label: item.label,
    badgeCount:
      item.href === "/admin/author-applications"
        ? authorApplicationAttentionCount
        : item.href === "/admin/commercial-applications"
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
