#!/usr/bin/env node
/**
 * Unit checks for personal material delete UX and API guards.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testDeleteCopyHelpers() {
  const labels = read("src/lib/personal-materials/client/status-labels.ts");

  assert(labels.includes("getPersonalMaterialDeleteButtonLabel"), "delete button label helper");
  assert(labels.includes("getPersonalMaterialDeleteConfirmTitle"), "delete confirm title helper");
  assert(labels.includes("getPersonalMaterialDeleteSuccessToast"), "delete success toast helper");
  assert(labels.includes("getPersonalMaterialDeleteConfirmDescription"), "delete confirm description helper");
  assert(labels.includes("Удалить диагностику"), "diagnostic delete label");
  assert(labels.includes("Удалить материал"), "generic delete label");
  assert(labels.includes("Диагностика удалена"), "diagnostic success toast");
  assert(labels.includes("Материал удалён"), "generic success toast");
  assert(labels.includes("Отменить это действие будет невозможно"), "irreversible copy");
}

function testEditorDeleteUx() {
  const editor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx",
  );

  assert(editor.includes("getPersonalMaterialDeleteButtonLabel"), "editor uses delete label helper");
  assert(editor.includes("getPersonalMaterialDeleteConfirmDescription"), "editor uses confirm description helper");
  assert(editor.includes('deleted=${deletedParam}'), "editor passes deleted kind to list");
  assert(editor.includes('confirmAction === "delete"'), "delete confirm action");
  assert(editor.includes("toastTone"), "editor supports error toast on delete failure");
  assert(editor.includes('setConfirmAction(null)'), "delete error closes modal");
  assert(editor.includes("bg-[#d64545]"), "destructive delete button styling");
  assert(editor.includes("Удаление"), "delete section heading");
  assert(editor.includes("Аккаунт клиента не затрагивается"), "client account safety copy");
  assert(!editor.includes(">Удалить<"), "generic delete label removed from inline button");
}

function testListDeleteToast() {
  const list = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsClient.tsx",
  );

  assert(list.includes('searchParams.get("deleted")'), "list reads deleted query param");
  assert(list.includes("getPersonalMaterialDeleteSuccessToast"), "list uses delete success toast helper");
  assert(list.includes('params.delete("deleted")'), "list clears deleted query param");
}

function testDeleteApiRoute() {
  const itemRoute = read("src/app/api/author/personal-materials/[id]/route.ts");
  const auth = read("src/lib/personal-materials/server/auth.ts");

  assert(itemRoute.includes("requirePersonalMaterialAccess"), "delete checks material access");
  assert(itemRoute.includes("softDeletePersonalMaterial"), "delete soft deletes material");
  assert(itemRoute.includes("removePersonalMaterialStorageFiles"), "delete removes storage files");
  assert(auth.includes("author_members"), "ownership via author membership");
}

function testDeleteDbScript() {
  const db = read("scripts/stage-p2-personal-materials-api-db.mjs");

  assert(db.includes("soft_delete_personal_material"), "db test covers soft delete");
  assert(db.includes("strangerUserId"), "db test has stranger user fixture");
  assert(
    db.includes('soft_delete_personal_material') &&
      db.includes('state.strangerUserId'),
    "db test covers stranger delete forbidden",
  );
}

function main() {
  testDeleteCopyHelpers();
  testEditorDeleteUx();
  testListDeleteToast();
  testDeleteApiRoute();
  testDeleteDbScript();
  console.log("personal-material-delete-unit: PASS");
}

main();
