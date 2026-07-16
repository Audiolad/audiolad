/**
 * PR3.3 path validation smoke.
 * Run: npx --yes tsx scripts/playlists-pr3-3-path-smoke.mjs
 */
import {
  buildPlaylistCoverStoragePath,
  isValidPlaylistCoverPath,
} from "../src/lib/playlists/covers.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const userId = "11111111-1111-4111-8111-111111111111";
const playlistId = "22222222-2222-4222-8222-222222222222";
const otherUser = "33333333-3333-4333-8333-333333333333";
const otherPl = "44444444-4444-4444-8444-444444444444";
const fileId = "55555555-5555-4555-8555-555555555555";

const ok = buildPlaylistCoverStoragePath(userId, playlistId, fileId);
assert(isValidPlaylistCoverPath(ok, userId, playlistId), "valid path");

assert(!isValidPlaylistCoverPath(""), "empty");
assert(!isValidPlaylistCoverPath(null), "null");
assert(!isValidPlaylistCoverPath("   "), "whitespace");
assert(!isValidPlaylistCoverPath(` ${ok}`), "leading space");
assert(!isValidPlaylistCoverPath(`${ok} `), "trailing space");
assert(!isValidPlaylistCoverPath(`/${ok}`), "absolute");
assert(!isValidPlaylistCoverPath(`../${ok}`), "traversal prefix");
assert(!isValidPlaylistCoverPath(`${userId}/../${playlistId}/${fileId}.webp`), "dotdot mid");
assert(!isValidPlaylistCoverPath(`${userId}//${playlistId}/${fileId}.webp`), "double slash");
assert(!isValidPlaylistCoverPath(`${userId}\\${playlistId}\\${fileId}.webp`), "backslash");
assert(!isValidPlaylistCoverPath(`${userId}/${playlistId}/${fileId}.jpg`), "wrong ext");
assert(!isValidPlaylistCoverPath(`${userId}/${playlistId}/${fileId}.png`), "png ext");
assert(
  !isValidPlaylistCoverPath(ok, otherUser, playlistId),
  "foreign user prefix",
);
assert(
  !isValidPlaylistCoverPath(ok, userId, otherPl),
  "foreign playlist prefix",
);
assert(
  !isValidPlaylistCoverPath(
    `${userId}/${otherPl}/${fileId}.webp`,
    userId,
    playlistId,
  ),
  "wrong playlist segment",
);

console.log("PR3_3_PATH_SMOKE_PASS");
