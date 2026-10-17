import {
  getAdminRatingsListenerDetailBundle,
  getAdminRatingsListenersBundle,
  writeAdminRatingsListenersAccessLog,
} from "@/lib/admin/analytics-ratings-listeners-queries";
import { handleRatingsListenerDetail } from "@/lib/admin/analytics-ratings-listeners-route";
import { requireRatingsListenersViewActor } from "@/lib/admin/analytics-ratings-route-guard";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  return handleRatingsListenerDetail(userId, {
    requireActor: requireRatingsListenersViewActor,
    getList: getAdminRatingsListenersBundle,
    getDetail: getAdminRatingsListenerDetailBundle,
    writeAccessLog: writeAdminRatingsListenersAccessLog,
    logError: (code, detail) => console.error(code, detail),
  });
}
