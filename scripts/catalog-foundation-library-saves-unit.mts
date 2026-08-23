import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createLibrarySave,
  createMemoryLibrarySavesStore,
  deleteLibrarySave,
  fromLibrarySaveRow,
  hasLibrarySave,
  LIBRARY_SAVES_TABLE,
  toLibrarySaveRow,
} from "../src/lib/library/saves";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const claimApi = readFileSync(
  join(repoRoot, "src/lib/library/claim-api.ts"),
  "utf8",
);
const saves = readFileSync(join(repoRoot, "src/lib/library/saves.ts"), "utf8");

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PRACTICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function testCreateSave() {
  const store = createMemoryLibrarySavesStore();
  const result = createLibrarySave(store, {
    userId: USER,
    practiceId: PRACTICE,
    createdAt: "2026-08-23T00:00:00.000Z",
  });

  assert.equal(result.created, true);
  assert.equal(result.save.userId, USER);
  assert.equal(result.save.practiceId, PRACTICE);
  assert.equal(hasLibrarySave(store, { userId: USER, practiceId: PRACTICE }), true);
  assert.equal(store.listForUser(USER).length, 1);
}

function testDuplicateSaveDoesNotCreateSecondRow() {
  const store = createMemoryLibrarySavesStore();
  const first = createLibrarySave(store, {
    userId: USER,
    practiceId: PRACTICE,
    createdAt: "2026-08-23T00:00:00.000Z",
  });
  const second = createLibrarySave(store, {
    userId: USER,
    practiceId: PRACTICE,
    createdAt: "2026-08-23T01:00:00.000Z",
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.save.createdAt, first.save.createdAt);
  assert.equal(store.listForUser(USER).length, 1);
}

function testDeleteSave() {
  const store = createMemoryLibrarySavesStore();
  createLibrarySave(store, { userId: USER, practiceId: PRACTICE });

  const deleted = deleteLibrarySave(store, {
    userId: USER,
    practiceId: PRACTICE,
  });
  const missing = deleteLibrarySave(store, {
    userId: USER,
    practiceId: PRACTICE,
  });

  assert.equal(deleted.deleted, true);
  assert.equal(missing.deleted, false);
  assert.equal(hasLibrarySave(store, { userId: USER, practiceId: PRACTICE }), false);
}

function testIsolationByUser() {
  const store = createMemoryLibrarySavesStore();
  createLibrarySave(store, { userId: USER, practiceId: PRACTICE });

  assert.equal(
    hasLibrarySave(store, { userId: OTHER, practiceId: PRACTICE }),
    false,
  );
  assert.equal(store.listForUser(OTHER).length, 0);
}

function testRowMapping() {
  const save = {
    userId: USER,
    practiceId: PRACTICE,
    createdAt: "2026-08-23T00:00:00.000Z",
  };

  assert.deepEqual(toLibrarySaveRow(save), {
    user_id: USER,
    practice_id: PRACTICE,
    created_at: "2026-08-23T00:00:00.000Z",
  });
  assert.deepEqual(fromLibrarySaveRow(toLibrarySaveRow(save)), save);
}

function testNoFavoritesOrEntitlementLeak() {
  assert.equal(LIBRARY_SAVES_TABLE, "library_saves");
  assert.doesNotMatch(saves, /CREATE TABLE|from\(["']favorites["']\)/);
  assert.doesNotMatch(saves, /access_source/);
  assert.doesNotMatch(saves, /claim_free_practice/);
  assert.match(claimApi, /access_source/, "existing claim API stays entitlement-only");
}

testCreateSave();
testDuplicateSaveDoesNotCreateSecondRow();
testDeleteSave();
testIsolationByUser();
testRowMapping();
testNoFavoritesOrEntitlementLeak();

console.log("catalog-foundation-library-saves-unit: ok");
