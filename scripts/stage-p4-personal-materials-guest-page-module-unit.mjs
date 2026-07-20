#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  formatGuestMaterialDate,
  getGuestDisplayTitle,
  getGuestGreeting,
  PERSONAL_MATERIAL_GUEST_PAGE_TITLE,
} from "../src/lib/personal-materials/guest/display.ts";
import { buildPersonalMaterialGuestApiPaths } from "../src/lib/personal-materials/guest/api-paths.ts";
import {
  buildPersonalMaterialProgressStorageKey,
  parsePersonalMaterialGuestProgress,
} from "../src/lib/personal-materials/guest/progress.ts";
import { buildPersonalMaterialGuestMetadata } from "../src/lib/personal-materials/guest/privacy.ts";
import { isValidAccessTokenFormat } from "../src/lib/personal-materials/tokens.ts";

const token = "a".repeat(43);

assert.equal(isValidAccessTokenFormat(token), true);
assert.ok(buildPersonalMaterialGuestApiPaths(token)?.audio.endsWith("/audio"));
assert.equal(buildPersonalMaterialGuestApiPaths("bad"), null);

assert.equal(getGuestGreeting("Anna"), "Для вас, Anna");
assert.equal(
  getGuestDisplayTitle(null, "diagnostic"),
  "Аудиодиагностика по фото",
);
assert.match(formatGuestMaterialDate("2026-07-20"), /20.*2026/);

const progressKey = buildPersonalMaterialProgressStorageKey(
  "00000000-0000-4000-8000-000000000001",
);
assert.equal(
  progressKey,
  "audiolad:personal-material-progress:00000000-0000-4000-8000-000000000001",
);
assert.equal(progressKey.includes("token"), false);

const progress = parsePersonalMaterialGuestProgress(
  JSON.stringify({ positionSeconds: 12, updatedAt: "2026-07-20T10:00:00.000Z" }),
);
assert.equal(progress?.positionSeconds, 12);
assert.equal(parsePersonalMaterialGuestProgress('{"positionSeconds":"x"}'), null);

const metadata = buildPersonalMaterialGuestMetadata();
assert.equal(metadata.robots?.index, false);
assert.equal(metadata.title, PERSONAL_MATERIAL_GUEST_PAGE_TITLE);
assert.equal(JSON.stringify(metadata).includes("Anna"), false);

console.log("stage-p4-personal-materials-guest-page-module-unit: PASS");
