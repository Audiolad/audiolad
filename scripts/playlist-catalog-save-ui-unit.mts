import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH } from "../src/lib/playlists/catalog-save";
import {
  buildPlaylistCatalogSaveRequest,
  persistPlaylistCatalogSave,
  resolvePlaylistCatalogSaveClick,
  startPlaylistCatalogSaveSignIn,
} from "../src/lib/playlists/use-playlist-catalog-save";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const PLAYLIST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const card = read("src/components/playlists/catalog/PlaylistCard.tsx");
const button = read("src/components/playlists/catalog/PlaylistSaveButton.tsx");
const hook = read("src/lib/playlists/use-playlist-catalog-save.ts");
const paths = read("src/lib/playlists/catalog-save.ts");
const grid = read("src/components/playlists/catalog/PlaylistGrid.tsx");
const page = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx",
);
const productHeart = read("src/components/products/CatalogProductHeartButton.tsx");

assert.equal(
  existsSync(join(root, "src/components/playlists/catalog/PlaylistSaveButton.tsx")),
  true,
);
assert.equal(
  existsSync(join(root, "src/app/api/playlists/saves/route.ts")),
  true,
);

assert.match(card, /PlaylistSaveButton/);
assert.match(card, /playlistId=\{item\.id\}/);
assert.match(card, /saved=\{item\.viewer\.saved\}/);
assert.doesNotMatch(card, /usePlaylistCatalogSave/);
assert.doesNotMatch(card, /practiceId/);
assert.doesNotMatch(card, /library_saves/);
assert.doesNotMatch(card, /useCatalogLibrarySave/);
assert.doesNotMatch(card, /CatalogProductHeartButton/);

assert.match(button, /usePlaylistCatalogSave/);
assert.match(button, /playlistId/);
assert.match(button, /data-playlist-catalog-heart-button/);
assert.doesNotMatch(button, /practiceId/);
assert.doesNotMatch(button, /library_saves/);
assert.doesNotMatch(button, /useCatalogLibrarySave/);
assert.doesNotMatch(button, /pending-library-save/);
assert.doesNotMatch(button, /writePendingLibrarySave/);

assert.match(paths, /\/api\/playlists\/saves/);
assert.match(hook, /PLAYLIST_CATALOG_SAVES_PATH/);
assert.match(hook, /playlistId/);
assert.match(hook, /buildAuthRouteHref/);
assert.doesNotMatch(hook, /practiceId/);
assert.doesNotMatch(hook, /library_saves/);
assert.doesNotMatch(hook, /writePendingLibrarySave/);
assert.doesNotMatch(hook, /pending-library-save/);
assert.doesNotMatch(hook, /useCatalogLibrarySave/);
assert.doesNotMatch(hook, /publishLibrarySave/);

assert.match(grid, /isAuthenticated/);
assert.match(grid, /signInReturnPath/);
assert.match(page, /isAuthenticated/);
assert.match(page, /PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH/);
assert.doesNotMatch(page, /practiceId/);
assert.doesNotMatch(page, /library_saves/);

assert.equal(PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH, "/playlists/catalog");
assert.equal(resolvePlaylistCatalogSaveClick(false), "sign_in");
assert.equal(resolvePlaylistCatalogSaveClick(true), "toggle");
assert.deepEqual(buildPlaylistCatalogSaveRequest(PLAYLIST, true), {
  method: "POST",
  url: "/api/playlists/saves",
  body: { playlistId: PLAYLIST },
});
assert.deepEqual(buildPlaylistCatalogSaveRequest(PLAYLIST, false), {
  method: "DELETE",
  url: "/api/playlists/saves",
  body: { playlistId: PLAYLIST },
});

const signIn = startPlaylistCatalogSaveSignIn({
  signInReturnPath: PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH,
});
assert.match(signIn.href, /\/auth\/sign-in/);
assert.match(signIn.href, /playlists%2Fcatalog|playlists\/catalog/);
assert.equal("pending" in signIn, false);

const persisted = await persistPlaylistCatalogSave({
  playlistId: PLAYLIST,
  nextSaved: true,
  fetchImpl: async (url, init) => {
    assert.equal(url, "/api/playlists/saves");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, JSON.stringify({ playlistId: PLAYLIST }));
    return {
      status: 200,
      json: async () => ({ saved: true, playlistId: PLAYLIST }),
    };
  },
});
assert.deepEqual(persisted, { ok: true, isSaved: true });

assert.match(productHeart, /useCatalogLibrarySave/);
assert.doesNotMatch(productHeart, /usePlaylistCatalogSave/);

console.log("playlist-catalog-save-ui-unit: ok");
