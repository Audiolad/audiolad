/**
 * PR5 public playlist page validation smoke (no network, no secrets).
 * Run: npx --yes tsx scripts/playlists-pr5-validation-smoke.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  isValidPlaylistPublicSlug,
  normalizePlaylistPublicSlug,
} from "../src/lib/playlists/public-slug.ts";
import {
  buildPublicPlaylistPath,
  buildPublicPlaylistCanonicalUrl,
} from "../src/lib/playlists/public-url.ts";
import { isPracticeEligibleForPublicPlaylist } from "../src/lib/playlists/public-content.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

assert(isValidPlaylistPublicSlug("pr5-public-demo"), "valid slug");
assert(isValidPlaylistPublicSlug("a-b-c"), "short valid");
assert(!isValidPlaylistPublicSlug(""), "empty");
assert(!isValidPlaylistPublicSlug("  "), "blank");
assert(!isValidPlaylistPublicSlug("AB"), "too short / upper");
assert(!isValidPlaylistPublicSlug("HasUpper"), "uppercase");
assert(!isValidPlaylistPublicSlug("bad_slug"), "underscore");
assert(!isValidPlaylistPublicSlug("../etc"), "traversal");
assert(!isValidPlaylistPublicSlug("a/b"), "slash");
assert(!isValidPlaylistPublicSlug("'; DROP TABLE playlists;--"), "sql-like");
assert(!isValidPlaylistPublicSlug("a".repeat(100)), "too long");

assert(
  normalizePlaylistPublicSlug("  hello-world  ") === "hello-world",
  "normalize",
);

assert(buildPublicPlaylistPath("my-pl") === "/p/my-pl", "path");
assert(
  buildPublicPlaylistCanonicalUrl("my-pl").endsWith("/p/my-pl"),
  "canonical",
);

assert(
  isPracticeEligibleForPublicPlaylist({
    id: "11111111-1111-4111-8111-111111111111",
    status: "published",
    is_free: true,
    price: 0,
    is_catalog_listed: true,
  }),
  "eligible free",
);

assert(
  !isPracticeEligibleForPublicPlaylist({
    id: "11111111-1111-4111-8111-111111111111",
    status: "published",
    is_free: false,
    price: 100,
    is_catalog_listed: true,
  }),
  "paid not eligible",
);

assert(
  !isPracticeEligibleForPublicPlaylist({
    id: "11111111-1111-4111-8111-111111111111",
    status: "archived",
    is_free: true,
    price: 0,
    is_catalog_listed: true,
  }),
  "archived not eligible",
);

const page = read("src/app/p/[slug]/page.tsx");
assert(page.includes("force-dynamic"), "dynamic");
assert(page.includes("loadPublicPlaylistBySlug"), "loader");
assert(page.includes("generateMetadata"), "metadata");
assert(page.includes("robots"), "robots");
assert(!page.includes("createServiceRoleClient"), "no service role in page");

const loader = read("src/lib/playlists/public-detail.ts");
assert(loader.includes("visibility"), "visibility check");
assert(loader.includes("published_at"), "published_at gate");
assert(loader.includes("isPracticeEligibleForPublicPlaylist"), "content gate");
assert(loader.includes("createPlaylistCoverSignedUrl"), "signed cover");
assert(loader.includes("cache("), "react cache");
assert(
  !/practices\s*\([\s\S]*audio_url[\s\S]*?\)/.test(loader),
  "no audio_url in practices select",
);
assert(!loader.includes("user_practices"), "no entitlement writes");
assert(!loader.includes(".update("), "no updates");
assert(!loader.includes("createClient(") || loader.includes("await createClient()"), "server client");
assert(loader.includes("createServiceRoleClient"), "service role for cover only");

assert(!isValidPlaylistPublicSlug("ab--cd"), "double hyphen");
assert(!isValidPlaylistPublicSlug("-abc"), "leading hyphen");
assert(!isValidPlaylistPublicSlug("abc-"), "trailing hyphen");

const { isValidPlaylistCoverPath } = await import(
  "../src/lib/playlists/covers.ts"
);
assert(
  !isValidPlaylistCoverPath(
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp",
    "33333333-3333-4333-8333-333333333333",
    "22222222-2222-4222-8222-222222222222",
  ),
  "foreign cover path rejected",
);

const routes = read("src/lib/auth/routes.ts");
assert(!routes.includes('"/p"'), "/p not private prefix");
assert(routes.includes('"/playlists"'), "playlists still private");

const detailUi = read("src/components/playlists/PlaylistDetailClient.tsx");
assert(detailUi.includes("Скопировать ссылку"), "detail copy link");

const listUi = read("src/components/playlists/PlaylistsClient.tsx");
assert(listUi.includes("Скопировать ссылку"), "list copy link");

assert(existsSync("src/components/playlists/PublicPlaylistPageView.tsx"), "view");
assert(
  existsSync("docs/playlists-pr5-public-page-ui-manual-checklist.md"),
  "checklist",
);
assert(
  existsSync("supabase/tests/playlists_pr5_public_page_smoke.sql"),
  "sql smoke",
);

console.log("PR5_VALIDATION_SMOKE_PASS");
