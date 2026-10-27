import { Suspense } from "react";

import AdminListenerCommentsPanel from "@/components/admin/AdminListenerCommentsPanel";
import { requireAnyAdminPermission } from "@/lib/admin/guard";
import { snapshotHasPermission } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

export default async function AdminListenerCommentsPage() {
  const session = await requireAnyAdminPermission([
    "products.moderate",
    "analytics.view",
  ]);
  return (
    <Suspense fallback={<p className="text-sm text-[#796ba0]">Загрузка…</p>}>
      <AdminListenerCommentsPanel
        canModerate={snapshotHasPermission(session.access, "products.moderate")}
        canViewRatings={snapshotHasPermission(session.access, "analytics.view")}
      />
    </Suspense>
  );
}
