import assert from "node:assert/strict";
import { resolveManualAdmission } from "../src/lib/business-admission/policy";

assert.deepEqual(resolveManualAdmission(null, null), { allowed: false, source: "unreviewed" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, null), { allowed: true, source: "artist" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, { allowed: false }), { allowed: false, source: "album" });
assert.deepEqual(resolveManualAdmission({ allowed: false }, { allowed: true }), { allowed: true, source: "album" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, { allowed: null }), { allowed: true, source: "artist" });
assert.deepEqual(resolveManualAdmission({ allowed: null }, { allowed: null }), { allowed: false, source: "unreviewed" });
assert.deepEqual(resolveManualAdmission({ allowed: false }, { allowed: null }), { allowed: false, source: "artist" });
console.log("Manual admission policy: PASS");
