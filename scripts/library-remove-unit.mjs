#!/usr/bin/env node
/**
 * Library remove unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRoot(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function isLibraryMembershipRemovable(accessSource) {
  return accessSource === "free_claim";
}

function extractRemovePracticeId(body) {
  const value = body.practice_id;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return null;
  }
  return trimmed.toLowerCase();
}

function mapRemoveRpcErrorMessage(message) {
  const normalized = message.toLowerCase();
  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }
  if (normalized.includes("practice_id_required")) {
    return { status: 400, error: "invalid_request" };
  }
  if (normalized.includes("not_in_library")) {
    return { status: 404, error: "not_in_library" };
  }
  if (normalized.includes("not_removable")) {
    return { status: 409, error: "not_removable" };
  }
  return { status: 500, error: "internal_error" };
}

function testRemovableSources() {
  assert(isLibraryMembershipRemovable("free_claim") === true, "free_claim removable");
  assert(isLibraryMembershipRemovable("starter") === false, "starter not removable");
  assert(isLibraryMembershipRemovable("purchase") === false, "purchase not removable");
  assert(isLibraryMembershipRemovable("gift") === false, "gift not removable");
  assert(
    isLibraryMembershipRemovable("subscription") === false,
    "subscription not removable",
  );
  assert(isLibraryMembershipRemovable("program") === false, "program not removable");
  assert(isLibraryMembershipRemovable("admin") === false, "admin not removable");
}

function testIdExtraction() {
  assert(
    extractRemovePracticeId({
      practice_id: "5fb00fbb-d66b-4c95-b993-04d4344b8d0b",
    }) === "5fb00fbb-d66b-4c95-b993-04d4344b8d0b",
    "valid uuid",
  );
  assert(extractRemovePracticeId({ practice_id: "not-a-uuid" }) === null, "bad uuid");
  assert(extractRemovePracticeId({ practice_slug: "x" }) === null, "slug rejected");
}

function testErrorMapping() {
  assert(
    mapRemoveRpcErrorMessage("not_removable").error === "not_removable",
    "not_removable mapped",
  );
  assert(mapRemoveRpcErrorMessage("not_removable").status === 409, "409 status");
  assert(
    mapRemoveRpcErrorMessage("not_in_library").error === "not_in_library",
    "not_in_library mapped",
  );
  assert(
    !JSON.stringify(mapRemoveRpcErrorMessage("purchase entitlement")).includes(
      "purchase",
    ),
    "source not leaked via unknown mapper path",
  );
}

function testMigrationContract() {
  const sql = readRoot(
    "supabase/migrations/20260804130000_remove_library_practice.sql",
  );

  assert(sql.includes("remove_library_practice"), "rpc name");
  assert(sql.includes("auth.uid()"), "uses auth.uid");
  assert(sql.includes("access_source IS DISTINCT FROM 'free_claim'"), "free_claim only");
  assert(sql.includes("not_removable"), "not_removable error");
  assert(sql.includes("not_in_library"), "not_in_library error");
  assert(!sql.includes("'starter'"), "starter not in removable allowlist");
  assert(sql.includes("FOR UPDATE"), "locks own row");
  assert(sql.includes("up.user_id = v_user_id"), "scoped to current user");
  assert(sql.includes("GRANT EXECUTE"), "authenticated execute");
  assert(sql.includes("REVOKE ALL"), "revokes public/anon");
  assert(sql.includes("audiolad:library-remove:v1"), "contract marker");
  assert(
    sql.includes("AND up.access_source = 'free_claim'"),
    "delete double-checks free_claim",
  );
}

function testSourceWiring() {
  const removable = readRoot("src/lib/library/removable.ts");
  const removeApi = readRoot("src/lib/library/remove-api.ts");
  const route = readRoot("src/app/api/library/remove/route.ts");
  const hook = readRoot("src/lib/library/use-library-membership.ts");
  const menu = readRoot("src/components/playlists/LibraryPracticeMenu.tsx");
  const library = readRoot("src/components/my-practices/MyPracticesLibrary.tsx");
  const button = readRoot("src/components/LibraryAddButton.tsx");

  assert(removable.includes('["free_claim"]'), "only free_claim allowlist");
  assert(!removable.includes("starter"), "starter excluded from allowlist");
  assert(removeApi.includes("not_removable"), "api maps not_removable");
  assert(route.includes("remove_library_practice"), "route calls rpc");
  assert(route.includes("p_practice_id"), "route passes practice id");
  assert(hook.includes("removeFromLibrary"), "hook exposes remove");
  assert(hook.includes("/api/library/remove"), "hook calls remove api");
  assert(hook.includes('publishLibraryMembership(membershipKey, "add")'), "publishes add");
  assert(!hook.includes("router.refresh()"), "no refresh in membership hook");
  assert(menu.includes("Удалить из Аудиотеки"), "menu label");
  assert(menu.includes("Удаляем…"), "pending label");
  assert(menu.includes("isLibraryMembershipRemovable"), "server accessSource gate");
  assert(menu.includes("canRemove"), "conditional menu item");
  assert(library.includes("Удалено из Аудиотеки"), "toast copy");
  assert(library.includes("handleRemovedFromLibrary"), "local card removal");
  assert(!library.includes("router.refresh()"), "library list no refresh");
  assert(
    !button.includes("removeFromLibrary"),
    "product/listen button does not wire remove click",
  );
}

function main() {
  testRemovableSources();
  testIdExtraction();
  testErrorMapping();
  testMigrationContract();
  testSourceWiring();
  console.log("library-remove-unit: PASS");
}

main();
