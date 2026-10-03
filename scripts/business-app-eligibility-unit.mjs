#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_AIRPLAY_CANDIDATE_PROBES,
  BUSINESS_ELIGIBILITY_DECISIONS,
  filterEligibleAirplayRows,
  formatEligibilityDecisionLabel,
  isBusinessEligibilityDecision,
  isEligibleForVenueAirplay,
  parseBusinessEligibilityPayload,
  venueAirplayEmptyStateCopy,
} from "../src/lib/business-app/eligibility.ts";
import { VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID } from "../src/lib/business-app/venue-player.ts";
import { BUSINESS_PRIMARY_NAV_ITEMS } from "../src/lib/business-app/nav.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.deepEqual(
  [...BUSINESS_ELIGIBILITY_DECISIONS],
  ["ELIGIBLE", "INELIGIBLE", "CONDITIONAL", "UNKNOWN"],
);

assert.equal(isEligibleForVenueAirplay("ELIGIBLE"), true);
assert.equal(isEligibleForVenueAirplay("UNKNOWN"), false);
assert.equal(isEligibleForVenueAirplay("INELIGIBLE"), false);
assert.equal(isEligibleForVenueAirplay("CONDITIONAL"), false);
assert.equal(isEligibleForVenueAirplay(null), false);
assert.equal(isEligibleForVenueAirplay("eligible"), false);

assert.equal(isBusinessEligibilityDecision("UNKNOWN"), true);
assert.equal(isBusinessEligibilityDecision("NOPE"), false);

const parsed = parseBusinessEligibilityPayload(
  {
    decision: "UNKNOWN",
    audio_item_id: VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID,
    track_code: "AL-T-PROBE",
    location_id: "11111111-1111-4111-8111-111111111111",
    zone_id: null,
    engine_version: "rights_eligibility_v1",
    reason_codes: ["LOCATION_RIGHTS_CONTEXT_MISSING"],
  },
  VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID,
);
assert.ok(parsed);
assert.equal(parsed.decision, "UNKNOWN");
assert.equal(parsed.reasonCodes[0], "LOCATION_RIGHTS_CONTEXT_MISSING");
assert.equal(isEligibleForVenueAirplay(parsed.decision), false);

assert.equal(parseBusinessEligibilityPayload({ decision: "YES" }, "x"), null);
assert.equal(parseBusinessEligibilityPayload(null, "x"), null);

assert.ok(BUSINESS_AIRPLAY_CANDIDATE_PROBES.length >= 1);
assert.equal(
  BUSINESS_AIRPLAY_CANDIDATE_PROBES[0].audioItemId,
  VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID,
);

const rows = [
  {
    audioItemId: "a",
    label: "a",
    decision: "UNKNOWN",
    trackCode: null,
    reasonCodes: ["X"],
    engineVersion: null,
    locationId: "l",
    zoneId: null,
    error: null,
  },
  {
    audioItemId: "b",
    label: "b",
    decision: "ELIGIBLE",
    trackCode: "AL-T-1",
    reasonCodes: [],
    engineVersion: "rights_eligibility_v1",
    locationId: "l",
    zoneId: null,
    error: null,
  },
  {
    audioItemId: "c",
    label: "c",
    decision: "ELIGIBLE",
    trackCode: null,
    reasonCodes: [],
    engineVersion: null,
    locationId: "l",
    zoneId: null,
    error: "rpc_failed",
  },
];
const eligible = filterEligibleAirplayRows(rows);
assert.equal(eligible.length, 1);
assert.equal(eligible[0].audioItemId, "b");

const empty = venueAirplayEmptyStateCopy({
  hasLocation: true,
  probed: true,
  eligibleCount: 0,
});
assert.match(empty.title, /пуст/i);
assert.match(empty.description, /уточняется|подтвержд/i);
assert.doesNotMatch(empty.description, /Лицензия активн/i);
assert.match(empty.description, /не утверждаем.*лицензирован/i);

assert.match(formatEligibilityDecisionLabel("ELIGIBLE"), /эфир/i);
assert.match(formatEligibilityDecisionLabel("UNKNOWN"), /уточняется/i);

assert.ok(
  BUSINESS_PRIMARY_NAV_ITEMS.some((i) => i.id === "music" && i.available),
  "music nav available",
);

assert.equal(
  existsSync(join(repoRoot, "src/lib/business-app/eligibility.ts")),
  true,
);
assert.equal(
  existsSync(
    join(repoRoot, "src/components/business-app/BusinessEligibilityProbePanel.tsx"),
  ),
  true,
);

const actions = readFileSync(
  join(repoRoot, "src/app/business-app/actions.ts"),
  "utf8",
);
assert.match(actions, /resolveBusinessAirplayEligibilityProbe/);
assert.match(actions, /resolve_business_track_eligibility/);
assert.match(actions, /createServiceRoleClient/);
assert.match(actions, /not_org_member/);

const player = readFileSync(
  join(repoRoot, "src/components/business-app/VenuePlayerPage.tsx"),
  "utf8",
);
assert.match(player, /BusinessEligibilityProbePanel/);
assert.match(player, /эфир|пригодност|уточняется/i);
assert.doesNotMatch(player, /Лицензия активн/i);

const music = readFileSync(
  join(repoRoot, "src/app/business-app/music/page.tsx"),
  "utf8",
);
assert.match(music, /BusinessEligibilityProbePanel/);
assert.doesNotMatch(music, /появятся позже/);

const home = readFileSync(
  join(repoRoot, "src/components/business-app/BusinessHomePage.tsx"),
  "utf8",
);
assert.doesNotMatch(home, /Лицензия активна/);
assert.match(home, /BUSINESS_RIGHTS_HOME_CONTROL|Статус прав/);

const docs = readFileSync(
  join(repoRoot, "src/app/business-app/documents/page.tsx"),
  "utf8",
);
assert.doesNotMatch(docs, /Лицензия и оплата/);
assert.match(docs, /BUSINESS_RIGHTS_DOCUMENTS_EMPTY/);

console.log("business-app-eligibility-unit: ok");
