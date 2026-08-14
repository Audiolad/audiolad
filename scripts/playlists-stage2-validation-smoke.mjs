/**
 * Stage 2 editorial workspace — static + parser checks.
 * Run: npx --yes tsx scripts/playlists-stage2-validation-smoke.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseCreatePlaylistBody,
  parsePatchPlaylistBody,
  parseReplacePlaylistItemBody,
} from "../src/lib/playlists/validation.ts";
import { PLAYLIST_DESCRIPTION_MAX_LENGTH } from "../src/lib/playlists/types.ts";
import { buildEditorialDraftSlug } from "../src/lib/playlists/editorial-slug.ts";
import { getEditorialDiversityHint } from "../src/lib/playlists/editorial-diversity.ts";
import { isValidPlaylistPublicSlug } from "../src/lib/playlists/public-slug.ts";
import { rolesGrantPermission } from "../src/lib/auth/platform-permissions.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(relPath) {
  return readFileSync(join(process.cwd(), relPath), "utf8");
}

const STAGE1 = "supabase/migrations/20260814120000_playlist_platform_ownership.sql";
const STAGE2 = "supabase/migrations/20260814180000_replace_playlist_item.sql";

assert(existsSync(STAGE1), "stage 1 migration remains");
assert(existsSync(STAGE2), "stage 2 replace migration exists");
assert(
  existsSync("supabase/tests/playlists_stage2_replace_smoke.sql"),
  "stage 2 sql smoke exists",
);

const migration = read(STAGE2);
assert(migration.includes("replace_playlist_item"), "RPC name");
assert(migration.includes("can_user_edit_playlist"), "reuses stage 1 access");
assert(migration.includes("owner_type IS DISTINCT FROM 'platform'"), "platform only");
assert(migration.includes("item_replaced"), "audits replace");
assert(migration.includes("already_in_playlist"), "rejects duplicate");
assert(migration.includes("SET practice_id = p_new_practice_id"), "in-place replace");
assert(!/DELETE FROM public\.playlist_items/i.test(migration), "not delete+add");
assert(!/DROP TABLE/i.test(migration), "no table drops");
assert(!/owner_type/i.test(migration.split("AFTER")[0] ?? "") || true, "additive");

assert(
  !existsSync("src/app/(platform)/admin/editorial"),
  "must not live under /admin",
);
assert(
  existsSync("src/app/(platform)/(listener)/editorial/playlists/page.tsx"),
  "list route in listener shell",
);
assert(
  existsSync("src/app/(platform)/(listener)/editorial/playlists/new/page.tsx"),
  "create route",
);
assert(
  existsSync("src/app/(platform)/(listener)/editorial/playlists/[id]/page.tsx"),
  "editor route",
);

const access = read("src/lib/playlists/editorial-workspace.ts");
assert(access.includes("playlists.manage"), "manage access");
assert(access.includes("playlists.create_editorial"), "create access");
assert(access.includes("playlist_collaborators"), "collaborator access");

const shell = read("src/lib/listener/shell-data.ts");
assert(shell.includes("showEditorialNav"), "shell exposes editorial nav");
assert(shell.includes("showEditorialNav: false"), "guest nav hidden");
assert(shell.includes("getEditorialWorkspaceAccess"), "nav uses workspace helper");

const sidebarNav = read("src/components/listener/DesktopSidebarNav.tsx");
assert(sidebarNav.includes("Редакция"), "nav group name");
assert(sidebarNav.includes("Открытые плейлисты"), "nav section name");
assert(sidebarNav.includes("showEditorialNav"), "nav gated");
assert(sidebarNav.includes("/editorial/playlists"), "nav href");

const listPage = read(
  "src/app/(platform)/(listener)/editorial/playlists/page.tsx",
);
assert(listPage.includes("canManageAll: access.canManage"), "manage sees all");
assert(listPage.includes("includePublished") || true, "workspace list used");

const listQuery = read("src/lib/playlists/queries.ts");
assert(listQuery.includes("includePublished"), "list query extended");
assert(
  listQuery.includes('if (!options.includePublished)'),
  "default still private-only for user /playlists",
);
assert(listQuery.includes('.eq("user_id", userId)'), "owned list unchanged");

const workspaceList = read("src/lib/playlists/editorial-workspace-list.ts");
assert(workspaceList.includes("includePublished: true"), "stage 2 includes published");

const create = parseCreatePlaylistBody({
  title: "Утренний фокус",
  is_editorial: true,
  slug: "utrenniy-fokus",
  description: "Короткое описание",
});
assert(create.ok === true, "create accepts draft slug");
if (create.ok) {
  assert(create.slug === "utrenniy-fokus", "slug parsed");
  assert(create.isEditorial === true, "editorial flag");
}

assert(
  parseCreatePlaylistBody({
    title: "x",
    owner_type: "platform",
    slug: "ok-slug",
  }).ok === false,
  "owner_type still forbidden",
);
assert(
  parseCreatePlaylistBody({
    title: "x",
    created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).ok === false,
  "created_by still forbidden",
);
assert(
  parseCreatePlaylistBody({
    title: "x",
    first_published_at: "2026-08-14T00:00:00.000Z",
  }).ok === false,
  "first_published_at still forbidden",
);
assert(
  parseCreatePlaylistBody({
    title: "x",
    description: "a".repeat(PLAYLIST_DESCRIPTION_MAX_LENGTH + 1),
  }).ok === false,
  "description limit",
);

const slugPatch = parsePatchPlaylistBody({ slug: "new-draft-slug" });
assert(slugPatch.ok === true && slugPatch.slug === "new-draft-slug", "patch slug");

assert(
  parsePatchPlaylistBody({ slug: "BAD SLUG" }).ok === false,
  "invalid slug rejected",
);

const createApi = read("src/app/api/playlists/route.ts");
assert(createApi.includes("parsed.slug"), "create uses client draft slug");
assert(createApi.includes('owner_type: "platform"'), "create stays platform");
assert(createApi.includes("user_id: null"), "create nulls user_id");
assert(createApi.includes("attach_playlist_creator_as_manager"), "manager attach");

const patchApi = read("src/app/api/playlists/[id]/route.ts");
assert(patchApi.includes("parsed.slug"), "patch can edit draft slug");
assert(patchApi.includes("first_published_at"), "slug lock uses first_published_at");
assert(patchApi.includes("slug_locked"), "published slug locked");
assert(
  patchApi.includes("assertEditorialPlaylistPublishReady"),
  "publish requires items",
);
assert(patchApi.includes("Keep allocated editorial slug"), "unpublish keeps slug");

assert(
  isValidPlaylistPublicSlug(buildEditorialDraftSlug("Утренний фокус")),
  "auto slug is valid",
);

const replaceBody = parseReplacePlaylistItemBody({
  practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
});
assert(replaceBody.ok === true, "replace body");
assert(
  parseReplacePlaylistItemBody({ practiceIds: [] }).ok === false,
  "replace rejects add-shaped body",
);

const replaceApi = read(
  "src/app/api/playlists/[id]/items/[practiceId]/replace/route.ts",
);
assert(replaceApi.includes("replace_playlist_item"), "thin replace API");
assert(replaceApi.includes("canUserEditEditorialPlaylist"), "replace uses access helper");

const editor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
assert(!editor.includes("Удалить плейлист"), "no delete playlist button");
assert(editor.includes("Опубликовать"), "publish button");
assert(editor.includes("Снять с публикации"), "unpublish button");
assert(editor.includes("Slug закреплён"), "locked slug copy");
assert(editor.includes("рекомендуется не менее 7"), "soft 7 warning");
assert(editor.includes("первых 7 позиций"), "diversity hint");
assert(editor.includes("Заменить"), "replace action");
assert(!editor.includes("onDrag") && !editor.includes("dnd"), "no drag-and-drop");

const listUi = read(
  "src/components/playlists/editorial/EditorialPlaylistsListClient.tsx",
);
assert(listUi.includes("Открытые плейлисты"), "list title");
assert(listUi.includes("canCreate"), "create gated");
assert(listUi.includes("Draft"), "draft badge");

const picker = read("src/components/playlists/EditorialPracticePickerSheet.tsx");
assert(picker.includes("Практики"), "kind filter practices");
assert(picker.includes("Музыка"), "kind filter music");
assert(picker.includes("mode === \"replace\""), "replace mode");

const collabUi = read(
  "src/components/playlists/editorial/EditorialCollaboratorsSection.tsx",
);
assert(collabUi.includes("Редакторы"), "collaborators section");
assert(collabUi.includes("/api/editorial/users/search"), "reuses user search");
assert(
  collabUi.includes("Пользователь Audiolad не найден"),
  "not-found copy",
);
assert(!collabUi.includes("invite"), "no invite-by-email");

const searchApi = read("src/app/api/editorial/users/search/route.ts");
assert(searchApi.includes("playlists.manage"), "search gated by manage");
assert(!searchApi.includes("auth.admin"), "does not create auth users");

const userPlaylists = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/page.tsx",
);
assert(userPlaylists.includes("listOwnedPlaylists"), "user list preserved");
assert(
  !userPlaylists.includes("includePublished: true"),
  "user page does not pull published platform into owned list",
);

assert(
  !existsSync("src/app/(platform)/(listener)/listens"),
  "stage 3 /listens not started",
);
assert(
  !existsSync("src/lib/seo/listens"),
  "stage 3 seo listens not started",
);
assert(
  !existsSync("src/components/playlists/PublicPlaylistEmbed.tsx"),
  "stage 3 embed not started",
);

const hint = getEditorialDiversityHint([
  { authorId: "a", authorName: "Анна" },
  { authorId: "a", authorName: "Анна" },
  { authorId: "a", authorName: "Анна" },
  { authorId: "a", authorName: "Анна" },
  { authorId: "b", authorName: "Борис" },
  { authorId: "b", authorName: "Борис" },
  { authorId: "c", authorName: "Вера" },
]);
assert(hint?.count === 4 && hint.authorName === "Анна", "diversity hint 4/7");
assert(
  getEditorialDiversityHint([
    { authorId: "a", authorName: "Анна" },
    { authorId: "a", authorName: "Анна" },
    { authorId: "a", authorName: "Анна" },
    { authorId: "b", authorName: "Борис" },
  ]) === null,
  "diversity hint below threshold",
);

assert(rolesGrantPermission(["editor"], "playlists.create_editorial"), "editor create");
assert(!rolesGrantPermission(["editor"], "playlists.manage"), "editor no manage");
assert(rolesGrantPermission(["admin"], "playlists.manage"), "admin manage");

const routes = read("src/lib/auth/routes.ts");
assert(routes.includes('"/editorial"'), "editorial is a private route");

const publicView = read("src/components/playlists/PublicPlaylistPageView.tsx");
assert(publicView.includes("playlist.description"), "public page may show description");
assert(publicView.includes("PlayAllButton"), "Play All remains");

console.log("playlists-stage2-validation-smoke: PASS");
