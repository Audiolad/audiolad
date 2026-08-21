import { createAdminSalesListHandler } from "@/lib/admin/sales-route-handlers";
import { requireAdminSalesViewActor } from "@/lib/admin/sales-route-guard";

export const dynamic = "force-dynamic";

export const GET = createAdminSalesListHandler({
  requireAccess: requireAdminSalesViewActor,
});
