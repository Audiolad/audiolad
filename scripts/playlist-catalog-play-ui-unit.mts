import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const card = read("src/components/playlists/catalog/PlaylistCard.tsx");
const button = read("src/components/playlists/catalog/PlaylistPlayButton.tsx");
const hook = read("src/lib/playlists/use-playlist-catalog-playback.ts");
const playback = read("src/lib/playlists/catalog-playback.ts");
const productPlay = read("src/components/products/CatalogProductPlayButton.tsx");

assert.equal(
  existsSync(join(root, "src/components/playlists/catalog/PlaylistPlayButton.tsx")),
  true,
);
assert.equal(existsSync(join(root, "src/lib/playlists/catalog-playback.ts")), true);
assert.equal(
  existsSync(join(root, "src/app/api/playlists/public/[slug]/route.ts")),
  true,
);

assert.match(card, /PlaylistPlayButton/);
assert.match(card, /slug=\{item\.slug\}/);
assert.match(card, /title=\{item\.title\}/);
assert.doesNotMatch(card, /playlist_items/);
assert.doesNotMatch(card, /usePlaylistCatalogPlayback/);
assert.doesNotMatch(card, /buildPublicPlaylistQueue/);
assert.doesNotMatch(card, /loadPlaylistQueue/);
assert.doesNotMatch(card, /activeQueue/);
assert.doesNotMatch(card, /handlePlayPause/);
assert.doesNotMatch(card, /viewer\.playing/);
assert.doesNotMatch(card, /loadCatalogPlaySession/);

assert.match(button, /usePlaylistCatalogPlayback/);
assert.match(button, /data-playlist-catalog-play-button/);
assert.match(button, /data-playlist-catalog-play-state/);
assert.match(button, /stopPropagation/);
assert.doesNotMatch(button, /playlist_items/);
assert.doesNotMatch(button, /items=/);
assert.doesNotMatch(button, /tracks/);
assert.doesNotMatch(button, /loadCatalogPlaySession/);
assert.doesNotMatch(button, /\/api\/catalog\/play/);
assert.doesNotMatch(button, /CatalogProductPlayButton/);

assert.match(hook, /useGlobalAudioPlayer/);
assert.match(hook, /loadPlaylistQueue/);
assert.match(hook, /handlePlayPause/);
assert.match(hook, /startPlaylistCatalogPlayback/);
assert.doesNotMatch(hook, /loadCatalogPlaySession/);
assert.doesNotMatch(hook, /\/api\/catalog\/play/);
assert.doesNotMatch(hook, /viewer\.playing/);

assert.match(playback, /buildPublicPlaylistQueue/);
assert.match(playback, /stay_on_source/);
assert.match(playback, /\/playlists\/catalog/);
assert.match(playback, /public_playlist/);
assert.doesNotMatch(playback, /loadCatalogPlaySession/);
assert.doesNotMatch(playback, /\/api\/catalog\/play/);

assert.match(productPlay, /fetchCatalogPlaySession/);
assert.doesNotMatch(productPlay, /usePlaylistCatalogPlayback/);

console.log("playlist-catalog-play-ui-unit: ok");
