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
  PLAYLIST_DESCRIPTION_TOO_LONG_MESSAGE,
  validatePlaylistDescription,
} from "../src/lib/playlists/validation.ts";
import {
  PLAYLIST_DESCRIPTION_MAX_LENGTH,
  PLAYLIST_OWNER_TYPES,
} from "../src/lib/playlists/types.ts";
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
assert(migration.includes("first_published_at"), "first_published_at column");
assert(
  /OLD\.first_published_at IS NOT NULL/.test(migration),
  "slug-lock trigger uses first_published_at, not only published_at",
);
assert(
  !/OLD\.owner_type = 'platform'\s+AND OLD\.published_at IS NOT NULL\s+AND NEW\.slug/.test(
    migration,
  ),
  "slug-lock must not key only on published_at",
);
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
  direction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
});
assert(editorialCreate.ok === true, "editorial draft create body allowed");
if (editorialCreate.ok) {
  assert(editorialCreate.isEditorial === true, "create flags editorial");
  assert(editorialCreate.visibility === "private", "create keeps private");
  assert(editorialCreate.description === "Краткое описание", "description parsed");
  assert(
    editorialCreate.directionId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "editorial create requires direction",
  );
}

assert(
  parseCreatePlaylistBody({
    title: "АудиоЛад подборка",
    visibility: "private",
    is_editorial: true,
  }).ok === false,
  "editorial create without direction_id is rejected",
);

const editorialPublicCreate = parseCreatePlaylistBody({
  title: "АудиоЛад подборка",
  visibility: "public",
  is_editorial: true,
  direction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    first_published_at: "2026-08-14T00:00:00.000Z",
  }).ok === false,
  "first_published_at forbidden on create",
);
assert(PLAYLIST_DESCRIPTION_MAX_LENGTH === 300, "description max is 300");
assert(
  validatePlaylistDescription("a".repeat(299)).ok === true,
  "299-char description accepted",
);
assert(
  validatePlaylistDescription("a".repeat(300)).ok === true,
  "300-char description accepted",
);
{
  const tooLong = validatePlaylistDescription("a".repeat(301));
  assert(tooLong.ok === false, "301-char description rejected");
  if (!tooLong.ok) {
    assert(
      tooLong.message === PLAYLIST_DESCRIPTION_TOO_LONG_MESSAGE,
      "301-char description has a clear validation message",
    );
  }
}
assert(
  parseCreatePlaylistBody({
    title: "x",
    description: "a".repeat(PLAYLIST_DESCRIPTION_MAX_LENGTH),
  }).ok === true,
  "create accepts 300-char description",
);
{
  const tooLongCreate = parseCreatePlaylistBody({
    title: "x",
    description: "a".repeat(PLAYLIST_DESCRIPTION_MAX_LENGTH + 1),
  });
  assert(tooLongCreate.ok === false, "description length check");
  if (!tooLongCreate.ok) {
    assert(
      tooLongCreate.message === PLAYLIST_DESCRIPTION_TOO_LONG_MESSAGE,
      "create >300 returns a clear validation message",
    );
  }
}
{
  const tooLongPatch = parsePatchPlaylistBody({
    description: "a".repeat(PLAYLIST_DESCRIPTION_MAX_LENGTH + 1),
  });
  assert(tooLongPatch.ok === false, "patch description length check");
  if (!tooLongPatch.ok) {
    assert(
      tooLongPatch.message === PLAYLIST_DESCRIPTION_TOO_LONG_MESSAGE,
      "patch >300 returns a clear validation message",
    );
  }
}

const DESC_MIGRATION =
  "supabase/migrations/20260816120000_playlist_description_max_300.sql";
assert(existsSync(DESC_MIGRATION), "description 300 migration exists");
const descMigration = read(DESC_MIGRATION);
assert(
  descMigration.includes("char_length(description) <= 300"),
  "migration adds 300 CHECK",
);
assert(
  /RAISE EXCEPTION/i.test(descMigration),
  "migration fail-closes on existing rows >300",
);
assert(
  !/substring|substr\(|left\(/i.test(descMigration),
  "migration must not truncate text",
);
assert(
  !/UPDATE\s+public\.playlists/i.test(descMigration),
  "migration must not UPDATE playlists",
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
    role: "playlist_admin",
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

const access = read("src/lib/playlists/playlist-access.ts");
assert(access.includes("export function isPlatformPlaylist"), "platform detector");
assert(access.includes("playlists.manage"), "edit/delete use playlists.manage");
assert(access.includes("isPlaylistCollaborator"), "collaborator check");
assert(access.includes("canUserDeletePlaylist"), "delete helper");
assert(
  access.includes('owner_type !== "platform"') ||
    access.includes("owner_type === \"user\""),
  "user owner path preserved",
);

const createApi = read("src/app/api/playlists/route.ts");
assert(
  createApi.includes("canUserCreateEditorialInDirection"),
  "create uses direction-scoped access",
);
assert(createApi.includes("direction_id: parsed.directionId"), "create sets direction");
assert(createApi.includes('owner_type: "platform"'), "editorial insert is platform");
assert(createApi.includes("user_id: null"), "editorial insert nulls user_id");
assert(createApi.includes('visibility: "private"'), "editorial starts draft");
assert(
  !createApi.includes("attach_playlist_creator_as_manager"),
  "direction editor is not auto-attached as collaborator",
);
assert(
  createApi.includes("countOwnedPlaylists") && createApi.includes("user.id"),
  "personal limit uses user id",
);
assert(
  createApi.includes("parsed.message"),
  "POST /api/playlists returns validation message",
);

const patchApi = read("src/app/api/playlists/[id]/route.ts");
assert(patchApi.includes("canUserEditPlaylist"), "patch uses access helper");
assert(patchApi.includes("canUserDeletePlaylist"), "delete uses delete helper");
assert(
  !patchApi.includes("Редакционный плейлист нельзя сделать приватным"),
  "old editorial-private reject removed",
);
assert(patchApi.includes("Keep allocated editorial slug"), "unpublish keeps slug");
assert(
  patchApi.includes("first_published_at"),
  "publish path stamps first_published_at",
);
assert(
  patchApi.includes("parsed.message"),
  "PATCH /api/playlists/[id] returns validation message",
);

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
