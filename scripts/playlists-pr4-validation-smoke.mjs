/**
 * PR4 move-item API validation smoke (no network, no secrets).
 * Run from repo root:
 *   npx --yes tsx scripts/playlists-pr4-validation-smoke.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  isUuid,
  parseMovePlaylistItemBody,
} from "../src/lib/playlists/validation.ts";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function read(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const practiceId = "11111111-1111-4111-8111-111111111111";
const playlistId = "22222222-2222-4222-8222-222222222222";

assert(isUuid(practiceId), "valid uuid");
assert(isUuid(playlistId), "valid playlist uuid");
assert(!isUuid("not-a-uuid"), "invalid uuid");
assert(!isUuid(""), "empty uuid");

let parsed = parseMovePlaylistItemBody({ direction: "up" });
assert(parsed.ok === true && parsed.direction === "up", "valid up");

parsed = parseMovePlaylistItemBody({ direction: "down" });
assert(parsed.ok === true && parsed.direction === "down", "valid down");

parsed = parseMovePlaylistItemBody({ direction: "UP" });
assert(parsed.ok === true && parsed.direction === "up", "case normalize");

parsed = parseMovePlaylistItemBody({ direction: "sideways" });
assert(parsed.ok === false, "invalid direction");

parsed = parseMovePlaylistItemBody({ direction: "up", position: 2 });
assert(parsed.ok === false, "unknown fields / position rejected");

parsed = parseMovePlaylistItemBody({
  direction: "up",
  playlistIds: [playlistId],
});
assert(parsed.ok === false, "array/extra rejected");

parsed = parseMovePlaylistItemBody({
  direction: "up",
  user_id: practiceId,
});
assert(parsed.ok === false, "user_id rejected");

parsed = parseMovePlaylistItemBody({});
assert(parsed.ok === false, "empty body");

parsed = parseMovePlaylistItemBody(null);
assert(parsed.ok === false, "null body");

parsed = parseMovePlaylistItemBody([]);
assert(parsed.ok === false, "array body");

const route = read(
  "src/app/api/playlists/[id]/items/[practiceId]/move/route.ts",
);
assert(route.includes("export async function POST"), "POST handler");
assert(route.includes("move_playlist_item"), "calls RPC");
assert(route.includes("createClientFromRequest"), "session client");
assert(!route.includes("createServiceRoleClient"), "no service role");
assert(route.includes("unauthorized"), "401 mapping");
assert(route.includes("invalid_request"), "400 mapping");
assert(route.includes("playlist_or_item_not_found"), "404 mapping");
assert(route.includes("reorder_conflict"), "409 mapping");
assert(route.includes("40P01"), "deadlock mapping");
assert(!/SELECT\s+.*FROM/i.test(route), "no raw SQL in route");

const migration = read(
  "supabase/migrations/20260716140000_move_playlist_item.sql",
);
assert(migration.includes("SECURITY DEFINER"), "definer");
assert(migration.includes("SET search_path = public, pg_temp"), "search_path");
assert(migration.includes("auth.uid()"), "auth.uid");
assert(migration.includes("FOR UPDATE"), "row lock");
assert(migration.includes("MAX(pi.position)"), "temp from max position");
assert(migration.includes("2147483647"), "integer overflow guard");
assert(migration.includes("reorder_conflict"), "conflict on overflow");
assert(!migration.includes("1000000000 +"), "no fixed 1e9 offset");
assert(migration.includes("REVOKE ALL ON FUNCTION public.move_playlist_item"), "revoke");
assert(migration.includes("FROM anon"), "anon revoke");
assert(migration.includes("GRANT EXECUTE"), "grant authenticated");
assert(!migration.includes("p_user_id"), "no user_id param");

const detail = read("src/components/playlists/PlaylistDetailClient.tsx");
assert(detail.includes("Переместить выше"), "aria up");
assert(detail.includes("Переместить ниже"), "aria down");
assert(detail.includes("/move"), "calls move API");
assert(detail.includes("router.refresh()"), "refresh after move");
assert(detail.includes("moveItem"), "move handler present");
assert(detail.includes("movingPracticeId"), "busy state");
assert(detail.includes("reorderBusy"), "row lock state");

assert(existsSync("supabase/tests/playlists_pr4_reorder_smoke.sql"), "sql smoke");
assert(
  existsSync("docs/playlists-pr4-ui-manual-checklist.md"),
  "ui checklist",
);

console.log("PR4_VALIDATION_SMOKE_PASS");
