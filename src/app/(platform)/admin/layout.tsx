import AdminNav, { type AdminNavLink } from "@/components/admin/AdminNav";
import AdminShell from "@/components/admin/AdminShell";
import { getCachedAdminAuthorApplicationAttentionSummary } from "@/lib/admin/author-application-attention-cache";
import { getCachedAdminCommercialApplicationAttentionSummary } from "@/lib/admin/commercial-application-attention-cache";
import { requireAdminLayoutAccess } from "@/lib/admin/guard";
import { getVisibleAdminNavItems } from "@/lib/admin/nav";
import { getCachedAdminProductModerationSubmittedCount } from "@/lib/admin/product-moderation-attention-cache";
import { snapshotHasPermission } from "@/lib/auth/platform-access";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdminLayoutAccess();
  const canViewAuthors = snapshotHasPermission(session.access, "authors.view");
  const canModerateProducts = snapshotHasPermission(
    session.access,
    "author_products.moderate",
  );

  let commercialNewCount = 0;
  let authorApplicationAttentionCount = 0;

  // Count-only head query, same filter as the «На модерации» sub-tab; only for moderators.
  const productModerationCountPromise = canModerateProducts
    ? getCachedAdminProductModerationSubmittedCount().catch((error: unknown) => {
        console.error("admin_layout_product_moderation_count_error", error);
        return 0;
      })
    : Promise.resolve(0);

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

  const productModerationSubmittedCount = await productModerationCountPromise;

  const navItems: AdminNavLink[] = getVisibleAdminNavItems(session.access).map((item) => {
    const link: AdminNavLink = {
      href: item.href,
      label: item.label,
      matchPrefixes: item.activePrefixes ? [...item.activePrefixes] : undefined,
      badgeCount:
        item.href === "/admin/author-applications"
          ? authorApplicationAttentionCount
          : item.href === "/admin/commercial-applications"
          ? commercialNewCount
          : undefined,
    };

    if (item.href === "/admin/product-moderation") {
      link.badgeCount = productModerationSubmittedCount;
      link.badgeTone = "attention";
      link.badgeLabel = "На модерации";
    }

    return link;
  });

  return (
    <AdminShell title="Панель управления" subtitle="Системное управление платформой">
      <AdminNav items={navItems} />
      <div className="mt-6">{children}</div>
    </AdminShell>
  );
}
