/**
 * Editorial playlist cover wiring — upload / replace / delete.
 * Run: npx --yes tsx scripts/playlists-editorial-cover-unit.mjs
 *
 * Covers:
 * - upload: editorial editor POSTs to the shared cover API
 * - replace: same POST + «Заменить обложку»
 * - delete: DELETE + «Удалить обложку»; stored path may belong to another editor
 * - /p/[slug] signs the stored cover_path (not the current editor id)
 * - user playlist cover UI/API stay on the same pipeline
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertPlaylistCoverPathForOwner,
  assertPlaylistCoverPathForPlaylist,
  isValidPlaylistCoverPath,
} from "../src/lib/playlists/covers.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relPath) {
  return readFileSync(join(process.cwd(), relPath), "utf8");
}

const uploaderId = "11111111-1111-4111-8111-111111111111";
const otherEditorId = "33333333-3333-4333-8333-333333333333";
const playlistId = "22222222-2222-4222-8222-222222222222";
const otherPlaylistId = "44444444-4444-4444-8444-444444444444";
const versionId = "55555555-5555-4555-8555-555555555555";
const storedPath = `${uploaderId}/${playlistId}/variants/${versionId}/lg.webp`;

assert(
  assertPlaylistCoverPathForPlaylist(storedPath, playlistId),
  "editorial cover path is valid for the playlist regardless of actor",
);
assert(
  !assertPlaylistCoverPathForOwner(storedPath, otherEditorId, playlistId),
  "owner-strict check still rejects another editor prefix",
);
assert(
  !assertPlaylistCoverPathForPlaylist(storedPath, otherPlaylistId),
  "playlist-scoped check rejects a foreign playlist id",
);
assert(
  isValidPlaylistCoverPath(storedPath, uploaderId, playlistId),
  "user playlist owner-strict path still works",
);

const coverRoute = read("src/app/api/playlists/[id]/cover/route.ts");
assert(coverRoute.includes("canUserEditPlaylist"), "cover API uses edit rights");
assert(
  coverRoute.includes("assertPlaylistCoverPathForPlaylist"),
  "DELETE/replace cleanup accepts another editor's stored path",
);
assert(
  coverRoute.includes("assertPlaylistCoverPathForOwner"),
  "new upload path still belongs to the current actor",
);
assert(
  coverRoute.includes("removeStoredPlaylistCoverObject"),
  "old cover cleanup uses playlist-scoped storage remove",
);
assert(
  !coverRoute.includes('owner_type === "user"'),
  "cover API must not reject platform editorial playlists",
);

const editor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
assert(editor.includes("Загрузить обложку"), "empty-state upload label");
assert(editor.includes("Заменить обложку"), "replace label");
assert(editor.includes("Удалить обложку"), "delete label");
assert(editor.includes("Нет обложки"), "empty cover state");
assert(editor.includes('className="sr-only"'), "native file input is hidden");
assert(
  editor.includes("setHasCustomCover(true)"),
  "upload/replace refresh local cover immediately",
);
assert(
  editor.includes("setHasCustomCover(false)"),
  "delete clears local cover immediately",
);
assert(
  editor.includes('method: "POST"') &&
    editor.includes("`/api/playlists/${detail.playlist.id}/cover`"),
  "upload/replace reuse shared cover API",
);
assert(
  editor.includes('method: "DELETE"') &&
    editor.includes("`/api/playlists/${detail.playlist.id}/cover`"),
  "delete reuses shared cover API",
);
assert(!editor.includes("Удалить плейлист"), "no hard-delete playlist button");
assert(!editor.includes("cover_url"), "no technical cover_url label");
assert(!editor.includes("upload file"), "no English upload-file label");

const userCoverUi = read("src/components/playlists/PlaylistDetailClient.tsx");
assert(
  userCoverUi.includes("`/api/playlists/${detail.playlist.id}/cover`"),
  "user playlist cover still uses the same API",
);
assert(userCoverUi.includes("Изменить обложку"), "user cover trigger remains");
assert(
  userCoverUi.includes("Вернуть автоматическую обложку"),
  "user clear-cover copy unchanged",
);

const publicDetail = read("src/lib/playlists/public-detail.ts");
assert(
  publicDetail.includes("createPlaylistCoverSignedUrl"),
  "/p/[slug] signs the stored cover",
);
assert(
  publicDetail.includes("playlist.cover_path"),
  "/p/[slug] reads stored cover_path",
);
assert(
  publicDetail.includes("playlist.user_id ?? undefined"),
  "platform playlists do not force a NULL user prefix on signed URLs",
);

const editorialDetail = read("src/lib/playlists/editorial-workspace-detail.ts");
assert(
  editorialDetail.includes("createPlaylistCoverSignedUrl"),
  "editorial editor loads a signed cover",
);
assert(
  editorialDetail.includes("{ playlistId }"),
  "editorial signed URL is not constrained to the current editor id",
);
assert(
  !editorialDetail.includes("{ userId, playlistId }"),
  "editorial signed URL must not require the current editor prefix",
);

const editorialList = read("src/lib/playlists/editorial-workspace-list.ts");
assert(
  editorialList.includes("createPlaylistCoverSignedUrlsBatch"),
  "editorial list still batch-signs covers",
);
assert(
  !editorialList.includes("{ userId: options.userId }"),
  "editorial list must not drop covers uploaded by another editor",
);

console.log("playlists-editorial-cover-unit: ok");
