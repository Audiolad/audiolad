/**
 * Stage 2.1 editorial directions + playlist_admin — static + parser checks.
 * Run: npx --yes tsx scripts/playlists-stage21-validation-smoke.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  parseCollaboratorUpsertBody,
  parseCreateDirectionBody,
  parseCreatePlaylistBody,
  parseDirectionMemberBody,
  parsePatchPlaylistBody,
} from "../src/lib/playlists/validation.ts";
import { PLAYLIST_COLLABORATOR_ROLES } from "../src/lib/playlists/types.ts";
import { rolesGrantPermission } from "../src/lib/auth/platform-permissions.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(relPath) {
  return readFileSync(join(process.cwd(), relPath), "utf8");
}

function listFiles(relDir) {
  const abs = join(process.cwd(), relDir);
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const next = join(relDir, entry.name);
    return entry.isDirectory() ? listFiles(next) : [next];
  });
}

function userFacingForbidden(source) {
  const strings = [...source.matchAll(/["'`]([^"'`]{0,120})["'`]/g)].map(
    (match) => match[1],
  );
  return strings.filter((value) => /\b(Editor|Manager|Slug)\b/.test(value));
}

const STAGE1 = "supabase/migrations/20260814120000_playlist_platform_ownership.sql";
const STAGE2 = "supabase/migrations/20260814180000_replace_playlist_item.sql";
const STAGE21 =
  "supabase/migrations/20260815120000_editorial_directions_and_playlist_admin.sql";

assert(existsSync(STAGE1), "stage 1 migration remains");
assert(existsSync(STAGE2), "stage 2 migration remains");
assert(existsSync(STAGE21), "stage 2.1 migration exists");
assert(
  existsSync("supabase/tests/playlists_stage21_directions_smoke.sql"),
  "stage 2.1 sql smoke exists",
);

const migration = read(STAGE21);
assert(migration.includes("editorial_directions"), "directions table");
assert(migration.includes("editorial_direction_members"), "members table");
assert(migration.includes("editorial_direction_audit_log"), "direction audit");
assert(migration.includes("direction_id"), "playlists.direction_id");
assert(migration.includes("playlist_admin"), "playlist_admin role");
assert(migration.includes("direction_editor"), "direction_editor role");
assert(migration.includes("is_direction_editor"), "direction helper");
assert(
  migration.includes("can_user_manage_playlist_collaborators"),
  "collaborator manage helper",
);
assert(
  migration.includes("role = 'playlist_admin'"),
  "collaborator check is playlist_admin only",
);
assert(
  migration.includes("WHERE role IN ('editor', 'manager')"),
  "backfill editor/manager",
);
assert(
  !/INSERT INTO public\.editorial_directions/i.test(migration) ||
    migration.includes("Do not seed"),
  "no production direction seed",
);
assert(!/olga|sergey/i.test(migration), "no named production users");
assert(!/DROP TABLE\s+public\.playlists/i.test(migration), "must not drop playlists");
assert(
  migration.includes("playlists_user_direction_null_check"),
  "user playlists cannot have direction_id",
);
assert(
  migration.includes("playlist_direction_immutable"),
  "direction_id change locked after create",
);
assert(
  migration.includes("is_direction_editor(direction_id, auth.uid())"),
  "insert allows direction editor of that direction",
);
assert(
  !migration.includes("playlists.create_editorial") ||
    !/WITH CHECK \(\s*[\s\S]*create_editorial/.test(migration),
  "insert does not require create_editorial",
);
assert(
  migration.includes("has_platform_permission(auth.uid(), 'playlists.manage')") &&
    migration.includes("FOR DELETE"),
  "platform delete stays manage-only",
);

assert(PLAYLIST_COLLABORATOR_ROLES.includes("playlist_admin"), "TS role");
assert(!PLAYLIST_COLLABORATOR_ROLES.includes("editor"), "editor role removed");
assert(!PLAYLIST_COLLABORATOR_ROLES.includes("manager"), "manager role removed");

assert(
  parseCreatePlaylistBody({
    title: "Утренний фокус",
    is_editorial: true,
    slug: "utrenniy-fokus",
    direction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).ok === true,
  "editorial create with direction",
);
assert(
  parseCreatePlaylistBody({
    title: "Утренний фокус",
    is_editorial: true,
    slug: "utrenniy-fokus",
  }).ok === false,
  "editorial create without direction rejected",
);
assert(
  parseCreatePlaylistBody({
    title: "Личный",
    direction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).ok === false,
  "user playlist cannot take direction_id",
);
assert(
  parseCollaboratorUpsertBody({
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "playlist_admin",
  }).ok === true,
  "playlist_admin accepted",
);
assert(
  parseCollaboratorUpsertBody({
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "editor",
  }).ok === false,
  "legacy editor role rejected",
);
assert(
  parseCollaboratorUpsertBody({
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).ok === true,
  "role optional, defaults to playlist_admin",
);
assert(
  parseCreateDirectionBody({
    name: "Функциональная музыка",
    slug: "funktsionalnaya-muzyka",
  }).ok === true,
  "direction create body",
);
assert(
  parseDirectionMemberBody({
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).ok === true,
  "direction member body",
);
assert(
  parsePatchPlaylistBody({
    direction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).ok === true,
  "patch may include direction_id",
);

const access = read("src/lib/playlists/playlist-access.ts");
assert(access.includes("direction_id"), "access row has direction_id");
assert(access.includes("isDirectionEditor"), "direction editor check");
assert(access.includes("canUserManageCollaborators"), "collaborator manage");
assert(access.includes("canUserDeletePlaylist"), "delete helper unchanged");
assert(
  access.includes('hasPermission(supabase, userId, "playlists.manage")'),
  "delete still manage-only for platform",
);

const workspace = read("src/lib/playlists/editorial-workspace.ts");
assert(workspace.includes("canManageDirections"), "manage directions flag");
assert(workspace.includes("listDirectionEditorIds"), "membership create path");
assert(
  !workspace.includes("playlists.create_editorial"),
  "create_editorial alone is not workspace create",
);

const queries = read("src/lib/playlists/queries.ts");
assert(queries.includes("directionIds"), "list scoped by directions");
assert(queries.includes('.eq("user_id", userId)'), "owned list unchanged");
assert(
  queries.includes('if (!options.includePublished)'),
  "user list default still private-only",
);

const createApi = read("src/app/api/playlists/route.ts");
assert(createApi.includes("direction_id: parsed.directionId"), "create writes direction");
assert(createApi.includes('owner_type: "platform"'), "create stays platform");
assert(createApi.includes("user_id: null"), "create nulls user_id");
assert(
  !createApi.includes("attach_playlist_creator_as_manager"),
  "no auto-attach on create",
);
assert(
  createApi.includes("canUserCreateEditorialInDirection"),
  "create checks direction access",
);

const patchApi = read("src/app/api/playlists/[id]/route.ts");
assert(patchApi.includes("canUserEditPlaylist"), "patch uses edit helper");
assert(patchApi.includes("canUserDeletePlaylist"), "delete uses delete helper");
assert(patchApi.includes("playlist_direction") || patchApi.includes("directionId"), "direction change gated");
assert(patchApi.includes("playlists.manage"), "direction move requires manage");

const collabApi = read("src/app/api/playlists/[id]/collaborators/route.ts");
assert(collabApi.includes('role: "playlist_admin"'), "always writes playlist_admin");
assert(collabApi.includes("canUserManageCollaborators"), "direction editor may manage");

const searchApi = read("src/app/api/editorial/users/search/route.ts");
assert(searchApi.includes("playlists.manage"), "search manage");
assert(searchApi.includes("isAnyDirectionEditor"), "search direction editor");
assert(!searchApi.includes("auth.admin"), "does not create auth users");

assert(
  existsSync("src/app/api/editorial/directions/route.ts"),
  "directions API",
);
assert(
  existsSync("src/app/api/editorial/directions/[id]/members/route.ts"),
  "direction members API",
);
assert(
  existsSync("src/app/(platform)/(listener)/editorial/directions/page.tsx"),
  "directions page in listener shell",
);
assert(
  existsSync("src/app/(platform)/(listener)/editorial/directions/[id]/page.tsx"),
  "direction detail page",
);
assert(
  !existsSync("src/app/(platform)/admin/editorial"),
  "must not live under /admin",
);

const directionsPage = read(
  "src/app/(platform)/(listener)/editorial/directions/page.tsx",
);
assert(directionsPage.includes("canManageDirections"), "directions page manage-only");
assert(directionsPage.includes("notFound()"), "404 otherwise");

const nav = read("src/components/listener/DesktopSidebarNav.tsx");
assert(nav.includes("Направления"), "nav label");
assert(nav.includes("showEditorialDirectionsNav"), "nav gated to manage");
assert(nav.includes("/editorial/directions"), "nav href");
assert(nav.includes("Открытые плейлисты"), "playlists nav remains");

const profileNav = read("src/components/profile/ProfileSections.tsx");
assert(
  profileNav.includes("showEditorialDirectionsNav"),
  "profile directions gated to manage",
);
assert(profileNav.includes('href="/editorial/directions"'), "profile directions href");
assert(profileNav.includes("Направления"), "profile directions label");

const listUi = read(
  "src/components/playlists/editorial/EditorialPlaylistsListClient.tsx",
);
assert(listUi.includes("directionFilter"), "direction filter/switcher");
assert(listUi.includes("canCreate"), "create gated");
assert(listUi.includes("Адрес плейлиста"), "address copy");

const createUi = read(
  "src/components/playlists/editorial/EditorialPlaylistCreateClient.tsx",
);
assert(createUi.includes("direction_id: selectedDirectionId"), "create sends direction");
assert(createUi.includes("Адрес плейлиста"), "create address label");
assert(createUi.includes("Выберите направление") || createUi.includes("Направление:"), "must choose direction");

const editor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
assert(!editor.includes("Удалить плейлист"), "no delete playlist button");
assert(editor.includes("Адрес плейлиста закреплён"), "locked address");
assert(editor.includes("directionName"), "shows direction name");
assert(editor.includes("Опубликовать"), "publish remains");

const collabUi = read(
  "src/components/playlists/editorial/EditorialCollaboratorsSection.tsx",
);
assert(collabUi.includes("Администраторы плейлиста"), "section title");
assert(collabUi.includes("Добавить администратора"), "add button");
assert(collabUi.includes("Отозвать доступ"), "revoke button");
assert(!collabUi.includes("Сделать"), "no role toggle");

const picker = read("src/components/playlists/EditorialPracticePickerSheet.tsx");
assert(picker.includes("Поиск практик и музыки"), "picker search copy");
assert(picker.includes("Практики"), "kind filter practices");
assert(picker.includes("Музыка"), "kind filter music");
assert(picker.includes('["all", "Все"]'), "all filter");

const directionsUi = [
  "src/components/playlists/editorial/EditorialDirectionsListClient.tsx",
  "src/components/playlists/editorial/EditorialDirectionDetailClient.tsx",
];
for (const rel of directionsUi) {
  const source = read(rel);
  assert(source.includes("Редактор направления"), `${rel} uses Russian role`);
}

const editorialUiFiles = listFiles("src/components/playlists/editorial").concat([
  "src/components/playlists/EditorialPracticePickerSheet.tsx",
  "src/app/(platform)/(listener)/editorial/playlists/page.tsx",
  "src/app/(platform)/(listener)/editorial/playlists/new/page.tsx",
  "src/app/(platform)/(listener)/editorial/playlists/[id]/page.tsx",
  "src/app/(platform)/(listener)/editorial/directions/page.tsx",
  "src/app/(platform)/(listener)/editorial/directions/[id]/page.tsx",
]);

for (const rel of editorialUiFiles) {
  const forbidden = userFacingForbidden(read(rel));
  assert(
    forbidden.length === 0,
    `${rel} has user-facing Editor/Manager/Slug: ${forbidden.join(", ")}`,
  );
}

const userPlaylists = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/page.tsx",
);
assert(userPlaylists.includes("listOwnedPlaylists"), "user list preserved");
assert(
  !userPlaylists.includes("includePublished: true"),
  "user page does not pull published platform into owned list",
);

const publicView = read("src/components/playlists/PublicPlaylistPageView.tsx");
assert(publicView.includes("PlayAllButton"), "Play All remains");

assert(
  existsSync("src/app/(platform)/(listener)/listens"),
  "stage 3 /listens lives in its own family",
);
assert(existsSync("src/lib/seo/listens"), "stage 3 seo listens family exists");
assert(
  existsSync("src/components/playlists/PublicPlaylistEmbed.tsx"),
  "stage 3 embed exists",
);

const pkg = read("package.json");
assert(pkg.includes("test:playlists-stage21"), "npm script exists");
assert(
  pkg.includes("npm run test:playlists-stage21"),
  "wired into npm test",
);

assert(rolesGrantPermission(["admin"], "playlists.manage"), "admin manage");
assert(!rolesGrantPermission(["editor"], "playlists.manage"), "editor no manage");
assert(
  rolesGrantPermission(["editor"], "playlists.create_editorial"),
  "create_editorial permission kept in RBAC",
);

console.log("playlists-stage21-validation-smoke: PASS");
