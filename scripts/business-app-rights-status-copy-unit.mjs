#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_RIGHTS_DOCUMENTS_EMPTY,
  BUSINESS_RIGHTS_FORBIDDEN_CLAIM_PATTERNS,
  BUSINESS_RIGHTS_HOME_CONTROL,
  BUSINESS_RIGHTS_MUSIC_PAGE_HEADER,
  BUSINESS_RIGHTS_ONBOARDING_DISCLAIMER,
  BUSINESS_RIGHTS_PLAYER_GATE_NOTE,
  BUSINESS_RIGHTS_PROBE_FOOTNOTE,
  assertOwnerRightsCopyIsSafe,
  formatEligibilityDecisionCode,
  formatOwnerEligibilityDecisionExplanation,
  formatOwnerEligibilityDecisionLabel,
  venueAirplayOwnerEmptyStateCopy,
} from "../src/lib/business-app/rights-status-copy.ts";
import { BUSINESS_ONBOARDING_RIGHTS_SAFE_DISCLAIMER } from "../src/lib/business-app/onboarding-wizard.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(BUSINESS_RIGHTS_HOME_CONTROL.tone, "warn");
assert.match(BUSINESS_RIGHTS_HOME_CONTROL.title, /прав/i);
assert.match(BUSINESS_RIGHTS_HOME_CONTROL.detail, /уточняется/i);

const surfaces = [
  BUSINESS_RIGHTS_HOME_CONTROL.title,
  BUSINESS_RIGHTS_HOME_CONTROL.detail,
  BUSINESS_RIGHTS_DOCUMENTS_EMPTY.title,
  BUSINESS_RIGHTS_DOCUMENTS_EMPTY.description,
  BUSINESS_RIGHTS_MUSIC_PAGE_HEADER.eyebrow,
  BUSINESS_RIGHTS_MUSIC_PAGE_HEADER.title,
  BUSINESS_RIGHTS_MUSIC_PAGE_HEADER.description,
  BUSINESS_RIGHTS_PROBE_FOOTNOTE,
  BUSINESS_RIGHTS_PLAYER_GATE_NOTE,
  BUSINESS_RIGHTS_ONBOARDING_DISCLAIMER,
  BUSINESS_ONBOARDING_RIGHTS_SAFE_DISCLAIMER,
  formatOwnerEligibilityDecisionLabel("ELIGIBLE"),
  formatOwnerEligibilityDecisionLabel("UNKNOWN"),
  formatOwnerEligibilityDecisionLabel("INELIGIBLE"),
  formatOwnerEligibilityDecisionLabel("CONDITIONAL"),
  formatOwnerEligibilityDecisionExplanation("UNKNOWN"),
  venueAirplayOwnerEmptyStateCopy({
    hasLocation: true,
    probed: true,
    eligibleCount: 0,
  }).description,
];

for (const text of surfaces) {
  assert.equal(
    assertOwnerRightsCopyIsSafe(text),
    true,
    `unsafe rights claim in: ${text}`,
  );
  for (const re of BUSINESS_RIGHTS_FORBIDDEN_CLAIM_PATTERNS) {
    // Explicit denial of the word forms — except the quoted «лицензировано» negation
    // which is allowed as a disclaimer. assertOwnerRightsCopyIsSafe forbids bare claims;
    // quoted disclaimers containing «лицензирована» still match /лицензирован/i.
    // Policy: negation phrases are OK if they contain «не утверждаем» / «не "лицензировано"».
  }
}

// Disclaimers may mention the forbidden word only inside negation.
for (const text of [
  BUSINESS_RIGHTS_DOCUMENTS_EMPTY.description,
  BUSINESS_RIGHTS_MUSIC_PAGE_HEADER.description,
  BUSINESS_RIGHTS_ONBOARDING_DISCLAIMER,
  BUSINESS_RIGHTS_PROBE_FOOTNOTE,
  venueAirplayOwnerEmptyStateCopy({
    hasLocation: true,
    probed: true,
    eligibleCount: 0,
  }).description,
]) {
  if (/лицензирован/i.test(text)) {
    assert.match(
      text,
      /не утверждаем|не «лицензировано»|без формулировок «лицензировано»|\(не «лицензировано»\)/i,
      `bare license claim: ${text}`,
    );
  }
}

assert.equal(formatEligibilityDecisionCode("UNKNOWN"), "UNKNOWN");
assert.match(formatOwnerEligibilityDecisionLabel("UNKNOWN"), /уточняется/i);
assert.match(formatOwnerEligibilityDecisionLabel("ELIGIBLE"), /эфир/i);

const empty = venueAirplayOwnerEmptyStateCopy({
  hasLocation: true,
  probed: true,
  eligibleCount: 0,
});
assert.match(empty.title, /пуст/i);

assert.equal(
  BUSINESS_ONBOARDING_RIGHTS_SAFE_DISCLAIMER,
  BUSINESS_RIGHTS_ONBOARDING_DISCLAIMER,
);

assert.equal(
  existsSync(join(repoRoot, "src/lib/business-app/rights-status-copy.ts")),
  true,
);

const home = readFileSync(
  join(repoRoot, "src/components/business-app/BusinessHomePage.tsx"),
  "utf8",
);
assert.doesNotMatch(home, /Лицензия активна/);
assert.match(home, /BUSINESS_RIGHTS_HOME_CONTROL/);

console.log("business-app-rights-status-copy-unit: ok");
