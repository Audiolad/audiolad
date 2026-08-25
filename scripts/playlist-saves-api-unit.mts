import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  handleCreatePlaylistSave,
  handleDeletePlaylistSave,
  parsePlaylistSaveRequestBody,
} from "../src/lib/playlists/playlist-saves-api";
import {
  asAsyncPlaylistSavesStore,
  createMemoryPlaylistSavesStore,
} from "../src/lib/playlists/playlist-saves";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const USER = "11111111-1111-4111-8111-111111111111";
const PLAYLIST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function createStore() {
  return asAsyncPlaylistSavesStore(createMemoryPlaylistSavesStore());
}

function testRequestParsing() {
  assert.deepEqual(parsePlaylistSaveRequestBody({ playlistId: PLAYLIST }), {
    ok: true,
    playlistId: PLAYLIST,
  });
  assert.equal(parsePlaylistSaveRequestBody({ playlistId: "not-a-uuid" }).ok, false);
  assert.equal(parsePlaylistSaveRequestBody({ practiceId: PLAYLIST }).ok, false);
  assert.equal(parsePlaylistSaveRequestBody({ playlist_id: PLAYLIST }).ok, false);
  assert.equal(parsePlaylistSaveRequestBody(null).ok, false);
}

async function testUnauthorized() {
  const store = createStore();
  const created = await handleCreatePlaylistSave({
    userId: null,
    body: { playlistId: PLAYLIST },
    store,
  });
  const removed = await handleDeletePlaylistSave({
    userId: null,
    body: { playlistId: PLAYLIST },
    store,
  });

  assert.deepEqual(created, { status: 401, body: { error: "unauthorized" } });
  assert.deepEqual(removed, { status: 401, body: { error: "unauthorized" } });
}

async function testInvalidId() {
  const store = createStore();
  const created = await handleCreatePlaylistSave({
    userId: USER,
    body: { playlistId: "bad" },
    store,
  });
  const removed = await handleDeletePlaylistSave({
    userId: USER,
    body: {},
    store,
  });

  assert.deepEqual(created, { status: 400, body: { error: "invalid_request" } });
  assert.deepEqual(removed, { status: 400, body: { error: "invalid_request" } });
}

async function testCreateSave() {
  const created = await handleCreatePlaylistSave({
    userId: USER,
    body: { playlistId: PLAYLIST },
    store: createStore(),
  });

  assert.equal(created.status, 200);
  assert.deepEqual(created.body, {
    saved: true,
    playlistId: PLAYLIST,
  });
}

async function testDuplicatePost() {
  const store = createStore();
  await handleCreatePlaylistSave({
    userId: USER,
    body: { playlistId: PLAYLIST },
    store,
  });
  const repeated = await handleCreatePlaylistSave({
    userId: USER,
    body: { playlistId: PLAYLIST },
    store,
  });

  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.body, {
    saved: true,
    playlistId: PLAYLIST,
  });
}

async function testDeleteSave() {
  const store = createStore();
  await handleCreatePlaylistSave({
    userId: USER,
    body: { playlistId: PLAYLIST },
    store,
  });

  const deleted = await handleDeletePlaylistSave({
    userId: USER,
    body: { playlistId: PLAYLIST },
    store,
  });

  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, {
    saved: false,
    playlistId: PLAYLIST,
  });
}

function testRouteUsesPlaylistDomain() {
  const route = read("src/app/api/playlists/saves/route.ts");
  const api = read("src/lib/playlists/playlist-saves-api.ts");

  assert.match(route, /createClientFromRequest/);
  assert.match(route, /getUser/);
  assert.match(route, /handleCreatePlaylistSave/);
  assert.match(route, /handleDeletePlaylistSave/);
  assert.match(route, /createSupabasePlaylistSavesStore/);
  assert.doesNotMatch(route, /library_saves/);
  assert.doesNotMatch(route, /practiceId/);
  assert.doesNotMatch(route, /handleCreateLibrarySave/);
  assert.doesNotMatch(api, /library_saves/);
  assert.doesNotMatch(api, /practiceId/);
  assert.doesNotMatch(api, /createLibrarySave/);
}

testRequestParsing();
await testUnauthorized();
await testInvalidId();
await testCreateSave();
await testDuplicatePost();
await testDeleteSave();
testRouteUsesPlaylistDomain();

console.log("playlist-saves-api-unit: ok");
