/**
 * Stage 1 public/editorial playlist ownership — static + parser checks.
 * Run: npx --yes tsx scripts/playlists-stage1-validation-smoke.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseCollaboratorDeleteBody,
  parseCollaboratorUpsertBody,
  parseCreatePlaylistBody,
  parsePatchPlaylistBody,
} from "../src/lib/playlists/validation.ts";
import {
  PLAYLIST_DESCRIPTION_MAX_LENGTH,
  PLAYLIST_OWNER_TYPES,
} from "../src/lib/playlists/types.ts";
import {
  canUserDeletePlaylist,
  canUserEditPlaylist,
  isPlatformPlaylist,
} from "../src/lib/playlists/playlist-access.ts";
import {
  PLATFORM_PERMISSIONS,
  rolesGrantPermission,
} from "../src/lib/auth/platform-permissions.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(relPath) {
  return readFileSync(join(process.cwd(), relPath), "utf8");
}

const MIGRATION = "supabase/migrations/20260814120000_playlist_platform_ownership.sql";
assert(existsSync(MIGRATION), "stage 1 migration exists");
assert(
  existsSync("supabase/tests/playlists_stage1_ownership_smoke.sql"),
  "stage 1 sql smoke exists",
);

const migration = read(MIGRATION);
assert(!/DROP TABLE\s+public\.playlists/i.test(migration), "must not drop playlists");
assert(
  !/DROP TABLE\s+public\.playlist_items/i.test(migration),
  "must not drop playlist_items",
);
assert(migration.includes("owner_type"), "owner_type column");
assert(migration.includes("created_by"), "created_by column");
assert(migration.includes("playlist_collaborators"), "collaborators table");
assert(migration.includes("playlist_audit_log"), "audit table");
assert(migration.includes("playlists.manage"), "RBAC manage");
assert(migration.includes("playlists.create_editorial"), "RBAC create");
assert(migration.includes("editorial_slug_locked"), "slug lock");
assert(migration.includes("ADD COLUMN IF NOT EXISTS"), "additive guards");
assert(
  migration.includes("user_id = NULL") || migration.includes("user_id = NULL"),
  "editorial backfill nulls user_id",
);
assert(
  migration.includes("created_by = COALESCE(created_by, user_id)"),
  "editorial backfill copies created_by",
);
assert(
  migration.includes("visibility = 'public'") &&
    migration.includes("published_at IS NOT NULL"),
  "public select requires published_at",
);
assert(
  migration.includes("owner_type = 'user'") &&
    migration.includes("is_editorial IS NOT TRUE"),
  "membership stays user-playlist only",
);

assert(PLAYLIST_OWNER_TYPES.includes("user"), "user owner type");
assert(PLAYLIST_OWNER_TYPES.includes("platform"), "platform owner type");
assert(
  PLATFORM_PERMISSIONS.includes("playlists.manage"),
  "TS permission playlists.manage",
);
assert(
  PLATFORM_PERMISSIONS.includes("playlists.create_editorial"),
  "TS permission playlists.create_editorial",
);
assert(rolesGrantPermission(["owner"], "playlists.manage"), "owner manage");
assert(rolesGrantPermission(["admin"], "playlists.manage"), "admin manage");
assert(
  rolesGrantPermission(["editor"], "playlists.create_editorial"),
  "editor create",
);
assert(
  !rolesGrantPermission(["editor"], "playlists.manage"),
  "editor no global manage",
);

const editorialCreate = parseCreatePlaylistBody({
  title: "АудиоЛад подборка",
  visibility: "private",
  is_editorial: true,
  description: "Краткое описание",
});
assert(editorialCreate.ok === true, "editorial draft create body allowed");
if (editorialCreate.ok) {
  assert(editorialCreate.isEditorial === true, "create flags editorial");
  assert(editorialCreate.visibility === "private", "create keeps private");
  assert(editorialCreate.description === "Краткое описание", "description parsed");
}

const editorialPublicCreate = parseCreatePlaylistBody({
  title: "АудиоЛад подборка",
  visibility: "public",
  is_editorial: true,
});
assert(
  editorialPublicCreate.ok === true,
  "legacy editorial+public body still parses; API forces draft",
);

assert(
  parseCreatePlaylistBody({
    title: "x",
    owner_type: "platform",
  }).ok === false,
  "owner_type forbidden on create",
);
assert(
  parseCreatePlaylistBody({
    title: "x",
    created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).ok === false,
  "created_by forbidden on create",
);
assert(
  parseCreatePlaylistBody({
    title: "x",
    description: "a".repeat(PLAYLIST_DESCRIPTION_MAX_LENGTH + 1),
  }).ok === false,
  "description length check",
);

const draftPatch = parsePatchPlaylistBody({
  visibility: "private",
  is_editorial: true,
});
assert(draftPatch.ok === true, "editorial+private patch allowed for draft/unpublish");

const descPatch = parsePatchPlaylistBody({ description: "  hello  " });
assert(descPatch.ok === true && descPatch.description === "hello", "patch description");

assert(
  parseCollaboratorUpsertBody({
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "editor",
  }).ok === true,
  "collaborator upsert",
);
assert(
  parseCollaboratorUpsertBody({
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "owner",
  }).ok === false,
  "collaborator role owner rejected",
);
assert(
  parseCollaboratorDeleteBody({
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).ok === true,
  "collaborator delete body",
);

const userRow = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  is_editorial: false,
  visibility: "private",
  owner_type: "user",
  published_at: null,
  slug: null,
};
const platformRow = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: null,
  is_editorial: true,
  visibility: "private",
  owner_type: "platform",
  published_at: null,
  slug: "draft-slug",
};

assert(isPlatformPlaylist(platformRow), "platform detector");
assert(!isPlatformPlaylist(userRow), "user detector");

const fakeSupabase = {
  from() {
    return {
      select() {
        return {
          eq() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
            };
          },
        };
      },
    };
  },
  rpc: async () => ({ data: false, error: null }),
};

assert(
  (await canUserEditPlaylist(fakeSupabase, userRow.user_id, userRow)) === true,
  "user owner can edit",
);
assert(
  (await canUserEditPlaylist(
    fakeSupabase,
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userRow,
  )) === false,
  "foreign user cannot edit",
);
assert(
  (await canUserDeletePlaylist(
    fakeSupabase,
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    platformRow,
  )) === false,
  "ordinary user cannot delete platform playlist",
);

const createApi = read("src/app/api/playlists/route.ts");
assert(createApi.includes("playlists.create_editorial"), "create uses new permission");
assert(createApi.includes('owner_type: "platform"'), "editorial insert is platform");
assert(createApi.includes("user_id: null"), "editorial insert nulls user_id");
assert(createApi.includes('visibility: "private"'), "editorial starts draft");
assert(
  createApi.includes("attach_playlist_creator_as_manager"),
  "creator becomes manager",
);
assert(
  createApi.includes("countOwnedPlaylists") && createApi.includes("user.id"),
  "personal limit uses user id",
);

const patchApi = read("src/app/api/playlists/[id]/route.ts");
assert(patchApi.includes("canUserEditPlaylist"), "patch uses access helper");
assert(patchApi.includes("canUserDeletePlaylist"), "delete uses delete helper");
assert(
  !patchApi.includes("Редакционный плейлист нельзя сделать приватным"),
  "old editorial-private reject removed",
);
assert(patchApi.includes("Keep allocated editorial slug"), "unpublish keeps slug");

const queries = read("src/lib/playlists/queries.ts");
assert(queries.includes('.eq("user_id", userId)'), "owned list still filters user_id");
assert(
  queries.includes('.eq("owner_type", "user")'),
  "personal count filters owner_type",
);

const membershipRpc = migration;
assert(
  membershipRpc.includes("pl.owner_type = 'user'"),
  "membership RPC filters owner_type",
);

const editorialApi = read(
  "src/app/api/playlists/[id]/editorial-practices/route.ts",
);
assert(
  !editorialApi.includes("products.moderate"),
  "editorial practices no longer keyed on products.moderate",
);
assert(
  editorialApi.includes("canUserEditEditorialPlaylist"),
  "editorial practices use playlist access helper",
);

const page = read("src/app/(platform)/(listener)/(playlists)/playlists/page.tsx");
assert(
  page.includes("playlists.create_editorial"),
  "playlists page create gate updated",
);

console.log("playlists-stage1-validation-smoke: PASS");
