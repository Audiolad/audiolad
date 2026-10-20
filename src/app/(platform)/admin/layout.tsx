import AdminNav, { type AdminNavLink } from "@/components/admin/AdminNav";
import AdminShell from "@/components/admin/AdminShell";
import { requireAdminLayoutAccess } from "@/lib/admin/guard";
import { getVisibleAdminNavItems } from "@/lib/admin/nav";
import { buildAdminNavAttention } from "@/lib/admin/nav-attention";
import { getCachedAdminNavAttentionCounts } from "@/lib/admin/nav-attention-cache";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdminLayoutAccess();
  const counts = await getCachedAdminNavAttentionCounts(session.access);
  const attention = buildAdminNavAttention(session.access, counts);
  const navItems: AdminNavLink[] = getVisibleAdminNavItems(session.access).map((item) => ({
    href: item.href,
    label: item.label,
    matchPrefixes: item.activePrefixes ? [...item.activePrefixes] : undefined,
    ...attention[item.href],
  }));

  return (
    <AdminShell title="Панель управления" subtitle="Системное управление платформой">
      <AdminNav items={navItems} />
      <div className="mt-6">{children}</div>
    </AdminShell>
  );
}
