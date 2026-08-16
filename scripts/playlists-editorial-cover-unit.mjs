/**
 * Editorial playlist cover UX — presentation fallback + editor/public wiring.
 * Run: npx --yes tsx scripts/playlists-editorial-cover-unit.mjs
 *
 * Covers:
 * - auto collage is presentation-only (first four by position)
 * - custom cover wins; clearing it returns the collage
 * - editor header is the only cover control
 * - /p/[slug] uses the same fallback
 * - platform playlist signed URLs do not depend on the current editor
 * - user playlist cover workflow stays on the same pipeline
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolvePlaylistCoverPresentation,
  takeFirstPlaylistItemCoverUrls,
} from "../src/lib/playlists/cover-presentation.ts";
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

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

const itemCovers = [
  "https://cdn.example/one.webp",
  "https://cdn.example/two.webp",
  "https://cdn.example/three.webp",
  "https://cdn.example/four.webp",
  "https://cdn.example/five.webp",
];

const noCustomFour = resolvePlaylistCoverPresentation(null, itemCovers);
assert(noCustomFour.kind === "collage", "no custom + 4+ items → collage");
assertDeepEqual(
  noCustomFour.urls,
  itemCovers.slice(0, 4),
  "collage uses the first four item covers by position",
);

const customWins = resolvePlaylistCoverPresentation(
  "https://cdn.example/custom.webp",
  itemCovers,
);
assert(customWins.kind === "custom", "custom cover wins over collage");
assert(
  customWins.url === "https://cdn.example/custom.webp",
  "custom presentation keeps the stored cover url",
);

const afterRemoveCustom = resolvePlaylistCoverPresentation(null, itemCovers);
assert(
  afterRemoveCustom.kind === "collage",
  "removing custom cover returns auto collage",
);
assertDeepEqual(
  afterRemoveCustom.urls,
  itemCovers.slice(0, 4),
  "revert uses the current first four item covers",
);

const reordered = [
  itemCovers[4],
  itemCovers[3],
  itemCovers[2],
  itemCovers[1],
  itemCovers[0],
];
const afterReorder = resolvePlaylistCoverPresentation(null, reordered);
assert(afterReorder.kind === "collage", "order change stays on auto collage");
assertDeepEqual(
  afterReorder.urls,
  reordered.slice(0, 4),
  "auto collage reflects the new first four after reorder",
);

const emptyPlaylist = resolvePlaylistCoverPresentation(null, []);
assert(emptyPlaylist.kind === "placeholder", "empty playlist → placeholder");

const shortList = resolvePlaylistCoverPresentation(null, [
  itemCovers[0],
  itemCovers[1],
]);
assert(shortList.kind === "collage", "fewer than 4 items still use collage");
assertDeepEqual(
  shortList.urls,
  [itemCovers[0], itemCovers[1], null, null],
  "remaining collage cells use the placeholder slots",
);

assertDeepEqual(
  takeFirstPlaylistItemCoverUrls(["", "  ", itemCovers[0], null, itemCovers[1]]),
  [null, null, itemCovers[0], null],
  "blank item covers stay in position instead of being compacted",
);

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

const presentation = read("src/lib/playlists/cover-presentation.ts");
assert(
  presentation.includes("presentation-only") ||
    presentation.includes("Presentation-only"),
  "helper documents presentation-only collage",
);
assert(
  !presentation.includes("createPlaylistCoverSignedUrl") &&
    !presentation.includes("uploadOptimizedImageSet"),
  "auto collage helper never writes storage",
);

const coverUi = read("src/components/playlists/PlaylistCover.tsx");
assert(
  coverUi.includes("resolvePlaylistCoverPresentation"),
  "shared PlaylistCover uses the presentation helper",
);
assert(coverUi.includes("grid-cols-2"), "collage is 2×2");
assert(coverUi.includes("grid-rows-2"), "collage has two rows");
assert(coverUi.includes("gap-0"), "collage has no gaps");
assert(coverUi.includes("object-cover"), "cells use object-fit cover");
assert(coverUi.includes("NeutralPlaylistPlaceholder"), "reuses placeholder");
assert(coverUi.includes("editable"), "visual component accepts editable state");
assert(coverUi.includes("Изменить обложку"), "hover/tap label");

const editor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
const dataSection = editor.slice(editor.indexOf(">Данные<"));
assert(dataSection.includes(">Данные<"), "Данные section still exists");
assert(!dataSection.includes(">Обложка<"), "Данные no longer has Обложка label");
assert(
  !dataSection.includes("Выберите файл"),
  "Данные no longer has Выберите файл",
);
assert(
  !dataSection.includes('type="file"'),
  "raw file input is gone from Данные",
);
assert(!editor.includes("Нет обложки"), "empty cover preview block removed");
assert(!editor.includes("Удалить обложку"), "old delete-cover label removed");
assert(editor.includes("Изменить обложку"), "header overlay label");
assert(editor.includes("Загрузить обложку"), "empty-state upload label");
assert(editor.includes("Заменить обложку"), "replace label");
assert(editor.includes("Вернуть автообложку"), "revert auto-cover label");
assert(editor.includes('className="sr-only"'), "native file input is hidden");
assert(editor.includes('type="file"'), "click-to-upload still uses file input");
assert(
  editor.includes("onCoverClick") && editor.includes("fileInputRef.current?.click()"),
  "header cover click opens the hidden file input",
);
assert(
  editor.includes("setHasCustomCover(true)"),
  "upload/replace refresh local cover immediately",
);
assert(
  editor.includes("setHasCustomCover(false)"),
  "revert clears local cover immediately",
);
assert(
  editor.includes("takeFirstPlaylistItemCoverUrls") &&
    editor.includes("items.map"),
  "editor collage follows current composition order",
);
assert(
  editor.includes('method: "POST"') &&
    editor.includes("`/api/playlists/${detail.playlist.id}/cover`"),
  "upload/replace reuse shared cover API",
);
assert(
  editor.includes('method: "DELETE"') &&
    editor.includes("`/api/playlists/${detail.playlist.id}/cover`"),
  "revert reuses shared cover API",
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
assert(
  publicDetail.includes("takeFirstPlaylistItemCoverUrls"),
  "/p uses the same first-four item cover fallback",
);
assert(
  !publicDetail.includes("mosaicFromAvailable"),
  "/p no longer builds mosaic only from eligible leftovers",
);

const publicPage = read("src/components/playlists/PublicPlaylistPageView.tsx");
assert(
  publicPage.includes("PlaylistCover"),
  "/p renders the shared playlist cover",
);
assert(
  publicPage.includes("detail.coverUrl") &&
    publicPage.includes("detail.mosaicCoverUrls"),
  "/p passes custom + ordered item covers into the shared cover",
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
assert(
  editorialDetail.includes("takeFirstPlaylistItemCoverUrls"),
  "editorial detail mosaic uses first four by position",
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
