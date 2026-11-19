"use server";

import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { BUSINESS_EVIDENCE_HREF } from "@/lib/evidence/constants";
import { createPlayLogExtract, listEvidenceLocations, type ExtractResult } from "@/lib/evidence/extract.server";
import { localInputToUtc } from "@/lib/evidence/play-log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner only. Read-only towards the database; writes the extract files on the server. */
export async function createPlayLogExtractAction(input: {
  locationId: string;
  fromLocal: string;
  toLocal: string;
}): Promise<ExtractResult> {
  const session = await requirePlatformOwnerAccess(BUSINESS_EVIDENCE_HREF);
  const locationId = typeof input?.locationId === "string" ? input.locationId.trim() : "";
  if (!UUID_RE.test(locationId)) return { ok: false, error: "no_location" };
  const locations = await listEvidenceLocations().catch(() => null);
  if (!locations) return { ok: false, error: "db_error" };
  const location = locations.find((l) => l.id === locationId);
  if (!location) return { ok: false, error: "no_location" };
  const from = localInputToUtc(String(input.fromLocal ?? ""), location.timezone);
  const to = localInputToUtc(String(input.toLocal ?? ""), location.timezone);
  if (!from || !to) return { ok: false, error: "bad_window" };
  return createPlayLogExtract({
    locationId,
    fromUtc: from,
    toUtc: to,
    actor: { userId: session.userId, email: session.email },
  });
}
