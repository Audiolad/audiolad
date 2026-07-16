/**
 * Static validation smoke for PR3.3 cover feature.
 * Run: npx --yes tsx scripts/playlists-pr3-3-validation-smoke.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = read(
  "supabase/migrations/20260716120000_playlist_covers.sql",
);
assert(migration.includes("cover_path"), "migration cover_path");
assert(migration.includes("cover_updated_at"), "migration cover_updated_at");
assert(migration.includes("playlist-covers"), "migration bucket");
assert(migration.includes("false"), "private bucket");
assert(migration.includes("get_owned_playlist_mosaic_covers"), "mosaic rpc");
assert(!migration.includes("Playlist owners can read own playlist covers"), "no owner SELECT policy");
assert(!migration.includes("image/svg"), "no svg mime");
assert(!migration.includes("image/gif"), "no gif mime");

const casMigration = read(
  "supabase/migrations/20260716121000_playlist_cover_path_cas.sql",
);
assert(casMigration.includes("replace_playlist_cover_path"), "CAS rpc");
assert(casMigration.includes("SECURITY DEFINER"), "CAS definer");
assert(casMigration.includes("FOR UPDATE"), "CAS row lock");
assert(casMigration.includes("auth.uid()"), "CAS auth.uid");

const coverRoute = read("src/app/api/playlists/[id]/cover/route.ts");
assert(coverRoute.includes("createServiceRoleClient"), "service role after auth");
assert(coverRoute.includes("getOwnedPlaylistById"), "ownership");
assert(coverRoute.includes("processPlaylistCoverImage"), "sharp pipeline");
assert(coverRoute.includes("replacePlaylistCoverPathCas"), "CAS in API");
assert(coverRoute.includes("cover_conflict"), "conflict code");
assert(coverRoute.includes("removePlaylistCoverObject"), "cleanup");

const deleteRoute = read("src/app/api/playlists/[id]/route.ts");
assert(deleteRoute.includes("cover_path"), "delete reads cover_path");
assert(deleteRoute.includes("removePlaylistCoverObject"), "delete cleans storage");

const coverUi = read("src/components/playlists/PlaylistCover.tsx");
assert(coverUi.includes("urls.length === 3"), "3 mosaic");
assert(coverUi.includes("grid-cols-2"), "2x2 mosaic");

const detail = read("src/components/playlists/PlaylistDetailClient.tsx");
assert(detail.includes("Изменить обложку"), "edit button");
assert(detail.includes("Вернуть автоматическую обложку"), "clear action");
assert(detail.includes("JPG, PNG или WebP, до 5 МБ"), "limit hint");
assert(!detail.includes("window.confirm"), "no native confirm");

assert(existsSync("scripts/fixtures/playlist-covers/landscape.jpg"), "jpg fixture");
assert(existsSync("src/lib/playlists/covers.ts"), "covers helper");
assert(existsSync("src/lib/playlists/cover-image.ts"), "cover-image helper");

console.log("PR3_3_VALIDATION_SMOKE_PASS");
