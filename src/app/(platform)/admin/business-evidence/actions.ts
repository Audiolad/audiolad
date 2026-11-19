"use server";

import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { BUSINESS_EVIDENCE_HREF } from "@/lib/evidence/constants";
import { createPlayLogExtract, loadEvidenceLocation, type ExtractResult } from "@/lib/evidence/extract.server";
import { localInputToUtc } from "@/lib/evidence/play-log";
import { createMatchReport, type ReportResult } from "@/lib/evidence/match-report.server";
import {
  createJob,
  finishUploadAndStart,
  startIndexBuild,
  type StartBuildResult,
} from "@/lib/evidence/matcher.server";

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
  let location;
  try {
    location = await loadEvidenceLocation(locationId);
  } catch {
    return { ok: false, error: "db_error" };
  }
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

// ------------------------------------------------------------------ matcher (t1578u PR-1/2)

export async function startIndexBuildAction(): Promise<StartBuildResult> {
  await requirePlatformOwnerAccess(BUSINESS_EVIDENCE_HREF);
  return startIndexBuild();
}

export async function createMatchJobAction(input: {
  fileName: string;
  size: number;
  claim: { fileName: string; size: number; label: string } | null;
  locationId: string;
  recordedAtLocal: string;
  note: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requirePlatformOwnerAccess(BUSINESS_EVIDENCE_HREF);
  const locationId = typeof input?.locationId === "string" && UUID_RE.test(input.locationId.trim()) ? input.locationId.trim() : null;
  const recorded = typeof input?.recordedAtLocal === "string" && input.recordedAtLocal.trim() ? input.recordedAtLocal.trim() : null;
  if (recorded) {
    if (!locationId) return { ok: false, error: "need_location" };
    let location;
    try {
      location = await loadEvidenceLocation(locationId);
    } catch {
      return { ok: false, error: "db_error" };
    }
    if (!location) return { ok: false, error: "no_location" };
    if (!localInputToUtc(recorded, location.timezone)) return { ok: false, error: "bad_time" };
  }
  const claim = input?.claim && typeof input.claim.fileName === "string"
    ? { fileName: input.claim.fileName, size: Number(input.claim.size), label: String(input.claim.label ?? "") }
    : null;
  return createJob({
    actor: { userId: session.userId, email: session.email },
    fileName: String(input?.fileName ?? ""),
    size: Number(input?.size),
    claim,
    locationId,
    recordedAtLocal: recorded,
    note: typeof input?.note === "string" && input.note.trim() ? input.note.trim() : null,
  });
}

export async function finishUploadAction(jobId: string) {
  await requirePlatformOwnerAccess(BUSINESS_EVIDENCE_HREF);
  return finishUploadAndStart(String(jobId ?? ""));
}

export async function createMatchReportAction(jobId: string): Promise<ReportResult> {
  const session = await requirePlatformOwnerAccess(BUSINESS_EVIDENCE_HREF);
  return createMatchReport(String(jobId ?? ""), { userId: session.userId, email: session.email });
}
