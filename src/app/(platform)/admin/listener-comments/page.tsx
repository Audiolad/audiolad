import AdminListenerCommentsPanel from "@/components/admin/AdminListenerCommentsPanel";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminListenerCommentsPage() {
  await requireAdminPermission("products.moderate");
  return <AdminListenerCommentsPanel />;
}
