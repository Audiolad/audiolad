#!/usr/bin/env node
/**
 * Phase 1 grantAccess helper + migration contract (no live database).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { grantAccess } from "../src/lib/products/grant-access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "supabase/migrations/20260923120000_course_access_levels_foundation.sql"),
  "utf8",
);
const accessTs = readFileSync(join(root, "src/lib/products/access.ts"), "utf8");

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_access_levels/);
assert.match(migration, /UNIQUE \(practice_id, level\)/);
assert.doesNotMatch(
  migration,
  /INSERT INTO public\.practice_access_levels/,
  "must not mass-insert Level 1 catalog rows",
);
assert.match(migration, /ADD COLUMN IF NOT EXISTS access_level integer NOT NULL DEFAULT 1/);
assert.match(
  migration,
  /ADD COLUMN IF NOT EXISTS required_access_level integer NOT NULL DEFAULT 1/,
);
assert.match(migration, /GREATEST\(/);
assert.match(migration, /DETAIL = 'course_only'/);
assert.match(migration, /grant_practice_purchase_access/);
assert.match(migration, /external_manual/);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.grant_practice_purchase_access\(uuid\)/,
);
assert.match(migration, /service_role must EXECUTE grant_practice_access/);
assert.match(migration, /service_role must EXECUTE grant_practice_purchase_access/);
assert.match(migration, /authenticated must not EXECUTE grant_practice_access/);
assert.match(migration, /authenticated must not EXECUTE grant_practice_purchase_access/);
assert.doesNotMatch(migration, /user_practices_keep_highest_access_level/);
assert.doesNotMatch(migration, /user_practices_access_level_monotonic/);
assert.doesNotMatch(migration, /order_kind|target_access_level/);
assert.doesNotMatch(accessTs, /access_level/, "learner filtering stays out of access.ts");

function mockRpc(handler) {
  return {
    rpc(name, args) {
      return Promise.resolve(handler(name, args));
    },
  };
}

const granted = await grantAccess(
  mockRpc((name, args) => {
    assert.equal(name, "grant_practice_access");
    assert.equal(args.p_user_id, "user-1");
    assert.equal(args.p_practice_id, "course-1");
    assert.equal(args.p_target_level, 2);
    assert.equal(args.p_access_source, "admin");
    assert.deepEqual(args.p_metadata, {});
    return {
      data: {
        user_id: "user-1",
        practice_id: "course-1",
        access_level: 2,
        previous_access_level: 1,
        inserted: false,
        raised: true,
      },
      error: null,
    };
  }),
  { userId: "user-1", practiceId: "course-1", targetLevel: 2 },
);

assert.equal(granted.access_level, 2);
assert.equal(granted.raised, true);

const externalGrant = await grantAccess(
  mockRpc((name, args) => {
    assert.equal(name, "grant_practice_access");
    assert.equal(args.p_access_source, "external_manual");
    return {
      data: {
        user_id: "user-1",
        practice_id: "course-1",
        access_level: 2,
        previous_access_level: null,
        inserted: true,
        raised: true,
      },
      error: null,
    };
  }),
  {
    userId: "user-1",
    practiceId: "course-1",
    targetLevel: 2,
    accessSource: "external_manual",
  },
);
assert.equal(externalGrant.inserted, true);

await assert.rejects(
  () =>
    grantAccess(
      mockRpc(() => ({ data: null, error: { message: "access_level_not_available" } })),
      { userId: "user-1", practiceId: "practice-1", targetLevel: 2 },
    ),
  /access_level_not_available/,
);

console.log("course-access-levels-unit: ok");
