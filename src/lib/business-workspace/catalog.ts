import type { BusinessEligibilityDecision } from "@/lib/business-app/eligibility";

import type { BusinessSpaceId } from "./spaces";

/**
 * Server-side catalog gate (task ba344b7f).
 * A track is playable only when the space is enabled, the track is admitted for that
 * space (task 28d2b5bb writes business_space_admissions; this module does not),
 * AND the rights engine says ELIGIBLE. UNKNOWN is not a bypass.
 */

export type SpaceAdmission = {
  spaceId: BusinessSpaceId;
  audioItemId: string;
};

export type TrackEligibility = {
  audioItemId: string;
  decision: BusinessEligibilityDecision;
};

export function selectWorkspaceTracks(input: {
  spaceId: BusinessSpaceId;
  spaceEnabled: boolean;
  admissions: readonly SpaceAdmission[];
  eligibility: readonly TrackEligibility[];
}): string[] {
  if (!input.spaceEnabled) return [];
  const eligible = new Set(
    input.eligibility.filter((row) => row.decision === "ELIGIBLE").map((row) => row.audioItemId),
  );
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const admission of input.admissions) {
    if (admission.spaceId !== input.spaceId) continue;
    if (!eligible.has(admission.audioItemId) || seen.has(admission.audioItemId)) continue;
    seen.add(admission.audioItemId);
    ids.push(admission.audioItemId);
  }
  return ids;
}
