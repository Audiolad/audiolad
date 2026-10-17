import {
  getAdminRatingsListenerDetailBundle,
  getAdminRatingsListenersBundle,
  writeAdminRatingsListenersAccessLog,
} from "@/lib/admin/analytics-ratings-listeners-queries";
import { handleRatingsListenersList } from "@/lib/admin/analytics-ratings-listeners-route";
import { requireRatingsListenersViewActor } from "@/lib/admin/analytics-ratings-route-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRatingsListenersList(request, {
    requireActor: requireRatingsListenersViewActor,
    getList: getAdminRatingsListenersBundle,
    getDetail: getAdminRatingsListenerDetailBundle,
    writeAccessLog: writeAdminRatingsListenersAccessLog,
    logError: (code, detail) => console.error(code, detail),
  });
}
