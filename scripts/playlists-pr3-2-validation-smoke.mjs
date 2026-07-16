/**
 * PR3.2 delete-item API validation helpers (no network).
 * Run: npx --yes tsx scripts/playlists-pr3-2-validation-smoke.mjs
 */

import { isUuid } from "../src/lib/playlists/validation.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isUuid("11111111-1111-4111-8111-111111111111"), "valid uuid");
assert(!isUuid("not-a-uuid"), "invalid uuid");
assert(!isUuid(""), "empty");

console.log("PR32_VALIDATION_SMOKE_PASS");
