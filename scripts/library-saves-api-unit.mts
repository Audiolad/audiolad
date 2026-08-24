import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  handleCreateLibrarySave,
  handleDeleteLibrarySave,
  handleListLibrarySaves,
  parseLibrarySavePracticeIdsQuery,
  parseLibrarySaveRequestBody,
} from "../src/lib/library/saves-api";
import {
  LIBRARY_SAVES_LOOKUP_MAX_IDS,
  asAsyncLibrarySavesStore,
  createMemoryLibrarySavesStore,
} from "../src/lib/library/saves";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const USER = "11111111-1111-4111-8111-111111111111";
const PRACTICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PRACTICE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function createStore() {
  return asAsyncLibrarySavesStore(createMemoryLibrarySavesStore());
}

function testRequestParsing() {
  assert.deepEqual(parseLibrarySaveRequestBody({ practiceId: PRACTICE }), {
    ok: true,
    practiceId: PRACTICE,
  });
  assert.equal(parseLibrarySaveRequestBody({ practiceId: "not-a-uuid" }).ok, false);
  assert.equal(parseLibrarySaveRequestBody({ practice_id: PRACTICE }).ok, false);
  assert.equal(parseLibrarySaveRequestBody(null).ok, false);

  assert.deepEqual(
    parseLibrarySavePracticeIdsQuery(`${PRACTICE},${OTHER_PRACTICE}`),
    { ok: true, practiceIds: [PRACTICE, OTHER_PRACTICE] },
  );
  assert.equal(parseLibrarySavePracticeIdsQuery("not-a-uuid").ok, false);
  assert.equal(
    parseLibrarySavePracticeIdsQuery(
      Array.from({ length: LIBRARY_SAVES_LOOKUP_MAX_IDS + 1 }, (_, index) => {
        const hex = index.toString(16).padStart(12, "0");
        return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
      }).join(","),
    ).ok,
    false,
  );
}

async function testCreateSave() {
  const created = await handleCreateLibrarySave({
    userId: USER,
    body: { practiceId: PRACTICE },
    store: createStore(),
  });

  assert.equal(created.status, 201);
  assert.deepEqual(created.body, {
    saved: true,
    created: true,
    practiceId: PRACTICE,
  });
}

async function testRepeatSave() {
  const store = createStore();
  await handleCreateLibrarySave({
    userId: USER,
    body: { practiceId: PRACTICE },
    store,
  });
  const repeated = await handleCreateLibrarySave({
    userId: USER,
    body: { practiceId: PRACTICE },
    store,
  });

  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.body, {
    saved: true,
    created: false,
    practiceId: PRACTICE,
  });
}

async function testDeleteSave() {
  const store = createStore();
  await handleCreateLibrarySave({
    userId: USER,
    body: { practiceId: PRACTICE },
    store,
  });

  const deleted = await handleDeleteLibrarySave({
    userId: USER,
    body: { practiceId: PRACTICE },
    store,
  });

  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, {
    saved: false,
    deleted: true,
    practiceId: PRACTICE,
  });
}

async function testDeleteMissingSave() {
  const deleted = await handleDeleteLibrarySave({
    userId: USER,
    body: { practiceId: PRACTICE },
    store: createStore(),
  });

  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, {
    saved: false,
    deleted: false,
    practiceId: PRACTICE,
  });
}

async function testUnauthorized() {
  const store = createStore();
  const create = await handleCreateLibrarySave({
    userId: null,
    body: { practiceId: PRACTICE },
    store,
  });
  const remove = await handleDeleteLibrarySave({
    userId: null,
    body: { practiceId: PRACTICE },
    store,
  });
  const list = await handleListLibrarySaves({
    userId: null,
    practiceIdsQuery: PRACTICE,
    store,
  });

  assert.deepEqual(create, { status: 401, body: { error: "unauthorized" } });
  assert.deepEqual(remove, { status: 401, body: { error: "unauthorized" } });
  assert.deepEqual(list, { status: 401, body: { error: "unauthorized" } });
}

async function testInvalidRequest() {
  const store = createStore();
  const create = await handleCreateLibrarySave({
    userId: USER,
    body: { practiceId: "bad" },
    store,
  });
  const remove = await handleDeleteLibrarySave({
    userId: USER,
    body: {},
    store,
  });
  const list = await handleListLibrarySaves({
    userId: USER,
    practiceIdsQuery: "id1,id2",
    store,
  });

  assert.deepEqual(create, { status: 400, body: { error: "invalid_request" } });
  assert.deepEqual(remove, { status: 400, body: { error: "invalid_request" } });
  assert.deepEqual(list, { status: 400, body: { error: "invalid_request" } });
}

async function testListSavedIds() {
  const store = createStore();
  await handleCreateLibrarySave({
    userId: USER,
    body: { practiceId: PRACTICE },
    store,
  });

  const listed = await handleListLibrarySaves({
    userId: USER,
    practiceIdsQuery: `${PRACTICE},${OTHER_PRACTICE}`,
    store,
  });

  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body, { savedIds: [PRACTICE] });
}

function testRouteUsesExistingAuthAndSaveDomain() {
  const route = read("src/app/api/library/saves/route.ts");
  const listing = read("src/lib/catalog/listing.ts");

  assert.match(route, /createClientFromRequest/, "route uses request client");
  assert.match(route, /createSupabaseLibrarySavesStore/, "route uses supabase adapter");
  assert.match(route, /export async function GET/, "GET exists");
  assert.match(route, /export async function POST/, "POST exists");
  assert.match(route, /export async function DELETE/, "DELETE exists");
  assert.doesNotMatch(route, /claim_free_practice/);
  assert.doesNotMatch(route, /user_practices/);
  assert.doesNotMatch(route, /access_source/);
  assert.doesNotMatch(route, /favorites/);
  assert.doesNotMatch(listing, /claim_free_practice/);
  assert.doesNotMatch(listing, /user_practices/);
  assert.match(listing, /isSaved/, "catalog listing attaches isSaved");
}

testRequestParsing();
await testCreateSave();
await testRepeatSave();
await testDeleteSave();
await testDeleteMissingSave();
await testUnauthorized();
await testInvalidRequest();
await testListSavedIds();
testRouteUsesExistingAuthAndSaveDomain();

console.log("library-saves-api-unit: ok");
