import "server-only";

import { parseCabinetReportBody } from "@/lib/business-app/cabinet-player-report";
import type { SpaReportResult } from "@/lib/business-app/spa-player-report";

/**
 * The signed-in cabinet no longer writes venue heartbeat or now playing.
 * Only the paired device does, through report_business_point_player.
 */
export async function handleCabinetPlayerReport(body: unknown): Promise<SpaReportResult> {
  if (!parseCabinetReportBody(body)) return { ok: false, reason: "invalid_request" };
  return { ok: false, reason: "no_access" };
}
